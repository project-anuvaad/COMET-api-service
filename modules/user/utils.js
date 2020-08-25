const User = require("../shared/models").User;

module.exports = {
  getUserByEmail(email) {
    return new Promise((resolve, reject) => {
      User.findOne({ email })
        .select("+organizationRoles.inviteToken")
        .populate("organizationRoles.organization")
        .then((userData) => {
          if (!userData) return resolve(null);
          userData = userData.toObject();
          return resolve(userData);
        })
        .catch(reject);
    });
  },
};
