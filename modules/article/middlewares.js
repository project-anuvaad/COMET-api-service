const { videoService } = require('../shared/services');
const Article = require('../shared/models').Article

function canUserAccess(userRole, requiredRoles) {
    let canView = false;
    if (userRole && userRole.organizationOwner) {
        canView = true;
    } else if (userRole) {
        if (userRole && userRole.permissions.some(p => requiredRoles.indexOf(p) !== -1)) {
            canView = true;
        }
    }
    return canView;
}

const middlewares = {
    authorizeArticleUpdate: function (req, res, next) {
        const { articleId } = req.params;
        let article;
        Article.findById(articleId)
            .then((articleDoc) => {
                article = articleDoc;
                return videoService.findById(article.video);
            })
            .then(video => {
                article.video = video;
                const organizationId = article.organization.toString();
                const organizationRole = req.user.organizationRoles.find((role) => role.organization._id.toString() === organizationId);
                if (!organizationRole) return res.status(401).send('Unauthorized');
                if (canUserAccess(organizationRole, ['admin', 'project_leader'])) return next();

                const { reviewers } = article.video;
                // If no users are assigned, anyone with review permissions can modify it
                if ((!reviewers || reviewers.length === 0) && canUserAccess(organizationRole, [
                    'review',
                    'break_videos',
                    'transcribe_text',
                    'approve_transcriptions',
                ])) return next();
                // Only assigned reviewers can modify original articles
                if (reviewers && reviewers.map((r) => r.toString()).indexOf(req.user._id.toString()) !== -1) return next();

                return res.status(401).send("You're not assigned to review this video");

            })
            .catch(err => {
                console.log(err);
                return res.status(400).send(err.message);
            })
    },
    authorizeArticleAdmin: function (req, res, next) {
        const { articleId } = req.params;
        Article.findById(articleId)
            .then((article) => {
                const organizationId = article.organization.toString();
                const organizationRole = req.user.organizationRoles.find((role) => role.organization._id.toString() === organizationId);

                if (!organizationRole) return res.status(401).send('Unauthorized');
                if (canUserAccess(organizationRole, ['admin', 'project_leader'])) return next();

                return res.status(401).send('Unauthorized');
            })
            .catch(err => {
                console.log(err);
                return res.status(400).send(err.message);
            })
    },
    authorizeFinishdateUpdate: function (req, res, next) {
        const { articleId } = req.params;
        const { speakerNumber } = req.body;
        const user = req.user;

        Article.findById(articleId)
            .then((articleDoc) => {
                if (!articleDoc) throw new Error('invalid article id');
                const translationInvitation = articleDoc.translators && articleDoc.translators.length > 0 ?  articleDoc.translators.find(t => t.speakerNumber === parseInt(speakerNumber)) : null;
                if (!translationInvitation) throw new Error('No one is assigned for this speaker');
                const organizationRole = req.user.organizationRoles.find((role) => role.organization._id.toString() === articleDoc.organization.toString());
                if (!organizationRole) throw new Error('Unauthorized');
                if (canUserAccess(organizationRole, ['admin', 'project_leader'])) return next();
                if (translationInvitation.user.toString() !== user._id.toString()) throw new Error('Unauthorized');
                return next();
            })
            .catch(err => {
                console.log(err);
                return res.status(400).send(err.message);
            })
    }
}

module.exports = middlewares;