const { authService } = require("../shared/services");

const User = require("../shared/models").User;
const utils = require("./utils");
const VW_SUPER_TRANSCRIBERS_EMAILS = process.env.VW_SUPER_TRANSCRIBERS_EMAILS && process.env.VW_SUPER_TRANSCRIBERS_EMAILS.split(',').length > 0 ? process.env.VW_SUPER_TRANSCRIBERS_EMAILS.split(',').map(r => r.trim()).filter(r => r) : [];

VW_SUPER_TRANSCRIBERS_EMAILS.forEach(email => {
    User.findOneAndUpdate({ email }, { $set: { superTranscriber: true } })
        .then(() => {
            console.log(email, ' is set as super transcriber')
        })
        .catch(err => {
            console.log(err)
        })
})


const controller = {
  updatePassword: function (req, res) {
    const { userId } = req.params;
    const { oldPassword, password, passwordConfirm } = req.body;
    let user;

    if (!password || password !== passwordConfirm)
      return res.status(400).send("Passwords doesnt match");
    if (password.length < 8)
      return res.status(400).send("Password must be at least 8 characters");

    User.find({ _id: userId })
      .select("+password")
      .then((users) => {
        if (!users || users.length === 0) throw new Error("Invalid user id ");
        user = users[0];
        return authService.encryptPassword(oldPassword);
      })
      .then((encryptedOldPassword) => {
        if (user.password !== encryptedOldPassword)
          throw new Error("Invalid old password");

          return authService.encryptPassword(password)
      })
      .then((encryptedPassword) => {
        return User.update(
          { _id: user._id },
          { $set: { password: encryptedPassword, passwordSet: true } }
        );
      })
      .then(() => {
        return res.json({ success: true });
      })
      .catch((err) => {
        console.log(err);
        return res.status(400).send(err.message);
      });
  },

  resetPassword: function (req, res) {
    const { resetCode, email, password, passwordConfirm } = req.body;
    if (!password || password !== passwordConfirm)
      return res.status(400).send("Passwords doesnt match");
    if (password.length < 8)
      return res.status(400).send("Password must be at least 8 characters");
    if (!resetCode) {
      return res.status(400).send("Invalid reset code");
    }
    let token;
    let user;
    User.findOne({ email })
      .select('+resetCode')
      .then((userDoc) => {
        if (!userDoc) throw new Error("Invalid user email");
        user = userDoc.toObject();
        if (user.resetCode !== resetCode) throw new Error("Invalid reset code");
        return authService.encryptPassword(password);
      })
      .then((encryptedPassword) => {
        return User.update(
          { _id: user._id },
          { $set: { password: encryptedPassword, passwordSet: true }, $unset: { resetCode : '' } }
        );
      })
      .then(() => {
        return authService.generateLoginToken(user._id);
      })
      .then((t) => {
        token = t;
        return utils.getUserByEmail(email);
      })
      .then((userData) => {
        return res.json({ success: true, token, user: userData });
      })
      .catch((err) => {
        console.log(err);
        return res.status(400).send(err.message);
      });
  },

  getAll: function (req, res) {
    const perPage = 30;

    const { organization, inviteStatus, permissions, search, page } = req.query;
    if (!organization) {
      return res.status(400).send("Organization id is required");
    }
    if (
      !req.user.organizationRoles.some(
        (o) => o.organization._id.toString() === organization
      )
    ) {
      return res.status(403).send("Forbidden");
    }
    const query = {
      organizationRoles: {
        $elemMatch: {
          ["organization"]: organization,
        },
      },
      apiUser: {
        $ne: true,
      },
    };

    const skip = page === 1 || page === 0 ? 0 : page * perPage - perPage;
    if (inviteStatus) {
      query["organizationRoles"]["$elemMatch"]["inviteStatus"] = inviteStatus;
    }

    if (search) {
      const re = new RegExp(search, "ig");
      query["$or"] = [{ firstname: re }, { lastname: re }, { email: re }];
    }

    if (permissions && permissions.length > 0) {
      if (Array.isArray(permissions)) {
        query["organizationRoles"]["$elemMatch"]["permissions"] = {
          $elemMatch: {
            $in: permissions,
          },
        };
      } else if (typeof permissions === "string") {
        query["organizationRoles"]["$elemMatch"]["permissions"] = permissions;
      }
    }
    console.log(skip, page);
    let users;
    User.find(query)
      .skip(skip)
      .limit(perPage)
      .then((u) => {
        users = u;
        return User.count(query);
      })
      .then((count) => {
        res.json({
          users,
          pagesCount: Math.ceil(count / perPage),
        });
      })
      .catch((err) => {
        console.log(err);
        return res.status(400).send("Something went wrong");
      });
  },

  getOrgUsers: function (req, res) {
    const { organization, inviteStatus, permissions, search } = req.query;
    const query = {
      organizationRoles: {
        $elemMatch: {
          ["organization"]: organization,
        },
      },
      apiUser: {
        $ne: true,
      },
    };

    if (inviteStatus) {
      query["organizationRoles"]["$elemMatch"]["inviteStatus"] = inviteStatus;
    }

    if (search) {
      const re = new RegExp(search, "ig");
      query["$or"] = [{ firstname: re }, { lastname: re }, { email: re }];
    }

    if (permissions && permissions.length > 0) {
      if (Array.isArray(permissions)) {
        query["organizationRoles"]["$elemMatch"]["permissions"] = {
          $elemMatch: {
            $in: permissions,
          },
        };
      } else if (typeof permissions === "string") {
        query["organizationRoles"]["$elemMatch"]["permissions"] = permissions;
      }
    }

    User.find(query)
      .then((users) => {
        res.status(200).send(users);
      })
      .catch((err) => {
        console.log(err);
        return res.status(400).send("Something went wrong");
      });
  },

  getOrgUsersCounts: function (req, res) {
    const { organization } = req.query;
    if (!organization) {
      return res.status(400).send("Please specify which organization");
    }
    let accepted = 0;
    let pending = 0;

    const acceptedQuery = {
      organizationRoles: {
        $elemMatch: {
          ["organization"]: organization,
        },
      },
      apiUser: {
        $ne: true,
      },
    };
    acceptedQuery["organizationRoles"]["$elemMatch"]["inviteStatus"] =
      "accepted";

    const pendingQuery = {
      organizationRoles: {
        $elemMatch: {
          ["organization"]: organization,
        },
      },
      apiUser: {
        $ne: true,
      },
    };
    pendingQuery["organizationRoles"]["$elemMatch"]["inviteStatus"] = "pending";

    User.count(acceptedQuery)
      .then((count) => {
        accepted = count;
        return User.count(pendingQuery);
      })
      .then((count) => {
        pending = count;
        return res.json({ accepted, pending });
      })
      .catch((err) => {
        console.log(err);
        return res.status(400).send("Something went wrong");
      });
  },

  getById: function (req, res) {
    const { id } = req.params;
    User.findById(id, {
      email: true,
      firstname: true,
      lastname: true,
      organizationRoles: true,
    })
      .then((user) => res.json({ user }))
      .catch((err) => {
        console.log(err);
        return res.status(400).send("Somthing went wrong");
      });
  },

  getUserDetails: function (req, res) {
    let currentUserName = req.user.email;
    utils
      .getUserByEmail(currentUserName)
      .then((userData) => {
        res.json(userData);
      })
      .catch((err) => {
        console.log(err);
        return res.status(400).send("Something went wrong");
      });
  },

  isValidToken: function (req, res) {
    let currentUserName = req.user.email;
    res.status(200).send({ isValid: !!currentUserName, user: req.user });
  },

  updateShowUserGuiding: function (req, res) {
    const user = req.user;
    const { showUserGuiding } = req.body;

    User.update({ _id: user._id }, { $set: { showUserGuiding } })
      .then(() => {
        return res.json({ showUserGuiding });
      })
      .catch((err) => {
        console.log(err);
        return res.status(400).send("Something went wrong");
      });
  },

  updateShowProofreadingTutorial: function (req, res) {
    const user = req.user;
    const { showProofreadingTutorial } = req.body;

    User.update({ _id: user._id }, { $set: { showProofreadingTutorial } })
      .then(() => {
        return res.json({ showProofreadingTutorial });
      })
      .catch((err) => {
        console.log(err);
        return res.status(400).send("Something went wrong");
      });
  },

  updateShowCuttingTutorial: function (req, res) {
    const user = req.user;
    const { showCuttingTutorial } = req.body;

    User.update({ _id: user._id }, { $set: { showCuttingTutorial } })
      .then(() => {
        return res.json({ showCuttingTutorial });
      })
      .catch((err) => {
        console.log(err);
        return res.status(400).send("Something went wrong");
      });
  },

  updateShowTranslatingTutorial: function (req, res) {
    const user = req.user;
    const { showTranslatingTutorial } = req.body;

    User.update({ _id: user._id }, { $set: { showTranslatingTutorial } })
      .then(() => {
        return res.json({ showTranslatingTutorial });
      })
      .catch((err) => {
        console.log(err);
        return res.status(400).send("Something went wrong");
      });
  },
};

module.exports = controller;
