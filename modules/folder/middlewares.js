const Folder = require("../shared/models").Folder;

const canUserAccess = (userRole, requiredRoles) => {
  let canView = false;
  if (userRole && userRole.organizationOwner) {
    canView = true;
  } else if (userRole) {
    if (
      userRole &&
      userRole.permissions.some((p) => requiredRoles.indexOf(p) !== -1)
    ) {
      canView = true;
    }
  }
  return canView;
};

const middlewares = {
  authorizeCreateFolder: (req, res, next) => {
    const { organization } = req.body;
    const userRole = req.user.organizationRoles.find(
      (role) => role.organization._id.toString() === organization
    );

    if (
      !userRole ||
      (!userRole.organizationOwner &&
        !canUserAccess(userRole, ["admin", "project_leader"]))
    ) {
      return res.status(401).send("Unauthorized");
    }

    return next();
  },

  validateCreateFolder: (req, res, next) => {
    const { name, parent, organization } = req.body;

    if (!name) return res.status(400).send("name field is required");

    if (!parent) {
      Folder.find({
        organization,
        name,
        parent: { $exists: false },
      })
        .then((folders) => {
          if (folders && folders.length > 0)
            return res.status(400).send("folder already exists");
          return next();
        })
        .catch((err) => {
          return res.status(400).send(err.message);
        });
    } else {
      Folder.findOne({ _id: parent, organization })
        .then((folder) => {
          if (!folder) return res.status(400).send("invalid parent folder id");
          Folder.find({
            organization,
            name,
            parent,
          })
            .then((folders) => {
              if (folders && folders.length > 0)
                return res.status(400).send("folder already exists");
              return next();
            })
            .catch((err) => {
              return res.status(400).send(err.message);
            });
        })
        .catch((err) => {
          console.log(err);
          return res.status(400).send(err.message);
        });
    }
  },

  authorizeUpdateName: (req, res, next) => {
    const { id } = req.params;
    Folder.findById(id)
      .then((folder) => {
        const userRole = req.user.organizationRoles.find(
          (userRole) =>
            userRole.organization._id.toString() ===
            folder.organization.toString()
        );
        if (
          !userRole ||
          (!userRole.organizationOwner &&
            !canUserAccess(userRole, ["admin", "project_leader"]))
        ) {
          return res.status(401).send("Unauthorized");
        }
        return next();
      })
      .catch((err) => {
        console.log(err);
        return res.status(400).send("Something went wrong");
      });
  },

  validateUpdateName: (req, res, next) => {
    const { id } = req.params;
    const { name } = req.body;

    if (!name) return res.status(400).send("name field is required");

    Folder.findById(id)
      .then((folder) => {
        const { _id, organization, parent } = folder;
        const query = { _id: { $ne: _id }, name, organization };
        if (parent) query.parent = parent;
        else query.parent = { $exists: false };
        Folder.findOne(query)
          .then((folder) => {
            if (folder) return res.status(400).send("folder already exists");
            return next();
          })
          .catch((err) => {
            console.log(err);
            return res.status(400).send("Something went wrong");
          });
      })
      .catch((err) => {
        console.log(err);
        return res.status(400).send("Something went wrong");
      });
  },
};

module.exports = middlewares;
