const fs = require("fs");

const Video = require("../shared/models").Video;

function canUserAccess(userRole, requiredRoles) {
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
}

const middlewares = {
    create_video: function(req, res, next) {
        const { title, langCode, numberOfSpeakers } = req.body;
        if (!title) {
            return res.status(400).send('title field is required');
        }
        if (!langCode) {
            return res.status(400).send('langCode field is required');
        }
        if (!numberOfSpeakers) {
            return res.status(400).send('speakers field is required');
        }
        // TODO Validate video title
        return next();
    },
  authorizeAdminAndReviewer: async function (req, res, next) {
    Video.findById(req.params.id)
      .then((video) => {
        if (!video) return res.status(400).send("invalid video id");
        const userRole = req.user.organizationRoles.find(
          (role) =>
            role.organization._id.toString() === video.organization.toString()
        );
        if (userRole && canUserAccess(userRole, ["admin", "prject_leader"]))
          return next();
        if (
          !userRole ||
          !canUserAccess(userRole, [
            "review",
            "break_videos",
            "transcribe_text",
            "approve_transcriptions",
          ])
        )
          return res.status(401).send("Unauthorized");
        // If there's no reviewers, allow user if a reviewer to export
        if (
          (!video.reviewers || video.reviewers.length === 0) &&
          userRole &&
          canUserAccess(userRole, [
            "review",
            "break_videos",
            "transcribe_text",
            "approve_transcriptions",
          ])
        )
          return next();
        // Authorize user's one of the assigned reviewers
        if (
          video.reviewers
            .map((r) => r.toString())
            .indexOf(req.user._id.toString()) === -1 &&
          (video.verifiers || [])
            .map((r) => r.toString())
            .indexOf(req.user._id.toString()) === -1
        )
          return res
            .status(401)
            .send("You're not assigned to review this video");
        return next();
      })
      .catch((err) => {
        return res.status(400).send(err.message);
      });
  },
  authorizeUploadVideo: async function (req, res, next) {
    const { organization } = req.body;
    const userRole = req.user.organizationRoles.find(
      (role) => role.organization._id.toString() === organization
    );
    if (
      !userRole ||
      (!userRole.organizationOwner &&
        !canUserAccess(userRole, ["admin", "project_leader", "uploader"]))
    ) {
      if (req.file && req.file.path) {
        fs.unlink(req.file.path, () => {});
      }
      return res.status(401).send("Unauthorized");
    }
    return next();
  },
  authorizeOwnerAndAdmin: function (req, res, next) {
    const { id } = req.params;
    Video.findById(id)
      .then((video) => {
        const userRole = req.user.organizationRoles.find(
          (role) =>
            role.organization._id.toString() === video.organization.toString()
        );
        if (
          !userRole ||
          (!userRole.organizationOwner &&
            userRole.permissions.indexOf("admin") === -1)
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
  authorizeVideoAdmin: function (req, res, next) {
    const { id } = req.params;
    Video.findById(id)
      .then((video) => {
        const userRole = req.user.organizationRoles.find(
          (role) =>
            role.organization._id.toString() === video.organization.toString()
        );
        if (
          !userRole ||
          (!userRole.organizationOwner &&
            userRole.permissions.indexOf("admin") === -1 &&
            userRole.permissions.indexOf("project_leader") === -1)
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
};

module.exports = middlewares;
