const userDbHandler = require("../../dbHandlers/user");
const BaseService = require("../BaseService");

class UserService extends BaseService {
  constructor() {
    super(userDbHandler);
  }

  getUserByEmail(email) {
    return new Promise((resolve, reject) => {
      this.findOne({ email })
        .select("+organizationRoles.inviteToken")
        .populate('organizationRoles.organization')
        .then((userData) => {
          if (!userData) return resolve(null);
          userData = userData.toObject();
          return resolve(userData);
        //   const fetchOrgFuncArray = [];
        //   userData.organizationRoles.forEach((role) => {
        //     fetchOrgFuncArray.push((cb) => {
        //       organizationService
        //         .findById(role.organization)
        //         .then((organization) => {
        //           role.organization = organization;
        //           cb();
        //         })
        //         .catch((err) => {
        //           console.log(err);
        //           return cb();
        //         });
        //     });
        //   });
        //   async.parallelLimit(fetchOrgFuncArray, 2, () => {
        //     return resolve(userData);
        //   });
        })
        .catch(reject);
    });
  }
}

module.exports = new UserService();
