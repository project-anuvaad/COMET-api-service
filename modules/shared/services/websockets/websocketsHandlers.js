const { AUTHENTICATE, AUTHENTICATE_FAILED, AUTHENTICATE_SUCCESS } = require('./websockets/events');
const { getOrganizationRoom } = require('./websockets/rooms');

const {
  authService,
  userService,
  socketConnectionService,
  apiKeyService,
} = require('../');

const handlers = [
  {
    event: AUTHENTICATE,
    handler: (socket) => (data) => {
      const { token, apiKey, organization } = data;
      let userData;
      if (token || apiKey) {
        let fetchUserPromise;
        if (token) {
          fetchUserPromise = authService.decodeToken(token)
        } else {
          fetchUserPromise = new Promise((resolve, reject) => {
            apiKeyService.findOne({ key: apiKey })
              .then((apiKeyDoc) => userService.findById(apiKeyDoc.user))
              .then(resolve)
              .catch(reject)
          })
        }
        fetchUserPromise
          .then(user => {
            const { email } = user;
            userService.find({ email })
              .then((usersData) => {
                userData = usersData[0];
                socketConnectionService.update({ userEmail: email }, { userEmail: userData.email, userId: userData._id, socketId: socket.id, organization }, { upsert: true, new: true })
                  .then(() => {
                    let userData;
                    userService.find({ email })
                      .then((users) => {
                        if (!users) throw new Error('Invalid user email');
                        userData = users[0];
                        if (userData.organizationRoles && userData.organizationRoles.find((or) => or.organization.toString() === organization.toString())) {
                          // Join organization room
                          if (!socket.rooms[getOrganizationRoom(organization)]) {
                            console.log('joining organization room');
                            socket.join(getOrganizationRoom(organization));
                          }
                          return socketConnectionService.find({ userEmail: email });
                        } else {
                          throw new Error('Not a member of the organization');
                        }
                      })
                      .then((socketConnections) => {
                        if (socketConnections && socketConnections.length > 0) {
                          return socket.emit(AUTHENTICATE_SUCCESS, socketConnections[0]);
                        }
                      })
                      .catch((err) => {
                        console.log(err);
                        return socket.emit(AUTHENTICATE_FAILED);
                      })
                  })
              })
              .catch(err => {
                console.log('error authenticating user', err);
                return socket.emit(AUTHENTICATE_FAILED);
              })
          })
          .catch(err => {
            console.log('decodeApiToken - error from socket ', err);
            return socket.emit(AUTHENTICATE_FAILED);
          })
      } else {
        return socket.emit(AUTHENTICATE_FAILED);
      }
    },
  },
];

module.exports = {
  handlers,
}