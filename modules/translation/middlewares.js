const { articleService } = require("../shared/services");

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
  authorizeTranslationUpdate: function (req, res, next) {
    const { articleId } = req.params;
    const { slidePosition, subslidePosition } = req.body;
    articleService
      .findById(articleId)
      .then((article) => {
        if (!article) return res.staus(400).send("Invalid article");

        const userRole = req.user.organizationRoles.find(
          (role) =>
            role.organization._id.toString() === article.organization.toString()
        );
        if (!userRole) return res.stats(401).send("Unauthorized");
        // Admins can do whatever they want. duh!
        if (canUserAccess(userRole, ["admin", "project_leader"])) return next();

        if (
          !canUserAccess(userRole, [
            "translate",
            "voice_over_artist",
            "translate_text",
            "approve_translations",
          ])
        ) {
          return res.status(401).send("Unauthorized");
        }

        const slide = article.slides.find(
          (s) => parseInt(slidePosition) === parseInt(s.position)
        );
        if (!slide) return res.status(400).send("Invalid slide position");

        const subslide = slide.content.find(
          (s) => parseInt(subslidePosition) === parseInt(s.position)
        );
        if (!subslide) return res.status(400).send("Invalid subslide position");

        const { translators, textTranslators, verifiers } = article;
        const subslideTranslationRole =
          translators && translators.length > 0
            ? translators.find(
                (t) => t.speakerNumber === subslide.speakerProfile.speakerNumber
              )
            : null;
        // If no-one is assigned to the translation, allow any translators to edit
        if (
          !subslideTranslationRole &&
          canUserAccess(userRole, [
            "translate",
            "voice_over_artist",
            "translate_text",
            "approve_translations",
          ])
        ) {
          return next();
        }
        const subslideTextTranslationRole =
          textTranslators && textTranslators.length > 0
            ? textTranslators.find(
                (t) => t.user.toString() === req.user._id.toString()
              )
            : null;
        if (subslideTextTranslationRole) {
          return next();
        }
        // Allow verifiers to update
        if (
          verifiers &&
          verifiers.length > 0 &&
          verifiers.indexOf(req.user._id) !== -1
        )
          return next();

        if (!subslideTranslationRole)
          return res
            .status(400)
            .send(
              `No users are assigned to this speaker ( Speaker ${subslide.speakerProfile.speakerNumber} )`
            );
        if (
          subslideTranslationRole.user.toString() !== req.user._id.toString()
        ) {
          return res
            .status(400)
            .send(
              `You're not assigned to translate for Speaker ${subslideTranslationRole.speakerNumber}`
            );
        }

        return next();
      })
      .catch((err) => {
        return res.status(400).send(err.message);
      });
  },
};

module.exports = middlewares;
