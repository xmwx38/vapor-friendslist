var FriendsListManager = require('./friendslistmanager.js');

var PLUGIN_NAME = 'vapor-friendslist';

exports.name = PLUGIN_NAME;

exports.plugin = function(VaporAPI) {
    var manager = new FriendsListManager(VaporAPI);

    var steamFriends = VaporAPI.getHandler('steamFriends');
    var Steam = VaporAPI.getSteam();
    var config = VaporAPI.data || {};
    var utils = VaporAPI.getUtils();

    var FRIENDSLIST_FILENAME = 'friendslist.json';

    var limit = config.limit || 100;
    var welcomeMessage = config.welcomeMessage || undefined;
    var welcomeMessageDelay = config.welcomeMessageDelay || 3000;

    function init() {
        // Handle 'friend' event
        VaporAPI.registerHandler({
                emitter: 'steamFriends',
                event: 'friend'
            },
            function(user, type) {
                if(type === Steam.EFriendRelationship.RequestRecipient) {
                    addFriend(steamFriends, user);
                } else if(type === Steam.EFriendRelationship.None) {
                    manager.remove(user);
                }

                saveFriendsList();
            }
        );

        // Handle 'relationships' event
        VaporAPI.registerHandler({
                emitter: 'steamFriends',
                event: 'relationships'
            },
            function() {
                for(var user in steamFriends.friends) {
                    if(steamFriends.friends[user] === Steam.EFriendRelationship.Friend) {
                        if(!(user in manager.friends)) {
                            manager.add(user);
                        }
                    } else if(steamFriends.friends[user] === Steam.EFriendRelationship.RequestRecipient) {
                        addFriend(steamFriends, user);
                    }
                }

                // 'friendsList' may still contain dead entries
                for(var friend in manager.friends) {
                    if(!(friend in steamFriends.friends)) {
                        manager.remove(friend);
                    }
                }

                saveFriendsList();

                VaporAPI.emitEvent('message:info', 'Friends list has been synchronized.');
            }
        );
    }

    /**
     * Adds friend to friends list.
     *
     * Also removes friend if necessary.
     * @param {object} steamFriends Active SteamFriends handler.
     * @param {string} user         SteamID64.
     */
    function addFriend(steamFriends, user) {
        if(manager.count() === limit) {
            var removedUser = manager.getOldestAdded();

            if(removedUser === null) {
                VaporAPI.emitEvent('message:warn', 'There\'s no one to be removed. Friend request from ' + user + ' will be ignored.');
                return;
            }

            steamFriends.removeFriend(removedUser);
            manager.remove(removedUser);

            VaporAPI.emitEvent('message:info', 'My friends list was full. ' + utils.getUserDescription(removedUser) + ' has been removed.');
            VaporAPI.emitEvent('friendRemoved', removedUser);
        }

        steamFriends.addFriend(user);
        manager.add(user);

        VaporAPI.emitEvent('message:info', 'User ' + user + ' has been added to my friends list.');
        VaporAPI.emitEvent('friendAccepted', user);

        if(welcomeMessage && typeof welcomeMessage === 'string') {
            setTimeout(function() {
                steamFriends.sendMessage(user, welcomeMessage);
            }, welcomeMessageDelay);
        }
    }

    function saveFriendsList() {
        VaporAPI.emitEvent('writeFile', FRIENDSLIST_FILENAME, JSON.stringify(manager.friends, null, 2), function(error) {
            if(error) {
                VaporAPI.emitEvent('message:warn', '`writeFile` event handler returned error.');
                VaporAPI.emitEvent('debug', error);
            }
        });
    }

    /**
     * Main entry point
     */
    var hasFileHandler =
        // concrete
        VaporAPI.hasHandler({emitter: 'plugin', plugin: PLUGIN_NAME, event: 'readFile'}) ||
        // any plugin
        VaporAPI.hasHandler({emitter: 'plugin', plugin: '*', event: 'readFile'}) ||
        // any emitter
        VaporAPI.hasHandler({emitter: '*', event: 'readFile'});

    if(hasFileHandler) {
        VaporAPI.emitEvent('readFile', FRIENDSLIST_FILENAME, function(error, data) {
             if(error) {
                 VaporAPI.emitEvent('debug', error);
                 init();
             } else {
                 try {
                     manager.friends = JSON.parse(data);
                 } catch(e) {
                     VaporAPI.emitEvent('message:warn', 'Failed to load friends list from cache.');
                     VaporAPI.emitEvent('debug', error);
                 }
                 init();
             }
         });
    } else {
        init();
    }
};
