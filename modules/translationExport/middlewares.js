const async = require('async');
const { articleService } = require('../shared/services');
// const organizationService = require
const TranslationExport = require('../shared/models').TranslationExport;

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
    authorizeApproveAndDecline: (req, res, next) => {
        const { translationExportId } = req.params;
        TranslationExport.findById(translationExportId)
        .then((translationExport) => {
            if (!translationExport) throw new Error('invalid id');
            const organizationRole = req.user.organizationRoles.find((role) => role.organization._id.toString() === translationExport.organization.toString());
            if (!organizationRole) return res.status(401).send('Unauthorized');
            if (canUserAccess(organizationRole, ['admin', 'project_leader']))
                return next();
                
            articleService.findById(translationExport.article)
            .then((articleDoc) => {
                const article = articleDoc.toObject();
                const verifiers = article.verifiers && article.verifiers.length > 0 ? article.verifiers.map(v => v.toString()) : [];
                if (verifiers.length === 0 || verifiers.indexOf(req.user._id.toString()) === -1) return res.status(401).send('Unauthorized'); 
                return next();
            })
            .catch((err) => {
                console.log(err);
                return res.status(400).send('Something went wrong');
            })
        })
        .catch((err) => {
            console.log(err);
            return res.status(400).send('Something went wrong');
        })
    },
    authorizeRequestExport: (req, res, next) => {
        const { articleId } = req.body;
        articleService.findById(articleId)
        .then((article) => {
            if (!article) throw new Error('invalid id');
            const organizationRole = req.user.organizationRoles.find((role) => role.organization._id.toString() === article.organization.toString());
            if (!canUserAccess(organizationRole, [
                'admin',
                'project_leader',
                'translate',
                'voice_over_artist',
                'translate_text',
                'approve_translations',
            ])){
                return res.status(401).send('Unauthorized');
            }
            return next();
        })
        .catch((err) => {
            console.log(err);
            return res.status(400).send(err.message);
        })   
    },
    authorizeRequestExportMultiple: (req, res, next) => {
        const { articlesIds } = req.body;
        let articlesFuncArray = [];
        articlesIds.forEach(articleId => {
            articlesFuncArray.push(cb => {
                articleService.findById(articleId)
                    .then((article) => {
                        if (!article) {
                            const err = new Error("invalid id");
                            err.invalidId = true;
                            throw err;
                        }
                        const organizationRole = req.user.organizationRoles.find((role) => role.organization._id.toString() === article.organization.toString());
                        if (!canUserAccess(organizationRole, [
                            'admin',
                            'project_leader',
                            'translate',
                            'voice_over_artist',
                            'translate_text',
                            'approve_translations',
                        ])){
                            const err = new Error("Unauthorized");
                            err.unauthorizedUser = true;
                            throw err;
                        }
                        cb();
                    })
                    .catch((err) => {
                        cb(err);
                    });
            });
        });

        async.series(articlesFuncArray)
            .then(() => {
                return next();
            })
            .catch(err => {
                console.log(err);
                if (err && err.unauthorizedUser) return res.status(401).send(err.message);
                if (err || err.invalidId) return res.status(400).send(err.message);
            });
    },
    validateArchiveAudios: (req, res, next) => {
        const { translationExportId } = req.params;
        TranslationExport.findById(translationExportId)
        .then((translationExport) => {
            if (!translationExport) throw new Error('Invalid id');
            if (translationExport.audiosArchiveUrl) throw new Error('An archive has already been generated for this translation');
            if (translationExport.audiosArchiveProgress) throw new Error('Archiving is already in progress');
            return next();
        })
        .catch((err) => {
            console.log(err);
            return res.status(400).send(err.message);
        })
    },
    validateGenerateSubtitles: (req, res, next) => {
        const { translationExportId } = req.params;
        TranslationExport.findById(translationExportId)
        .then((translationExport) => {
            if (!translationExport) throw new Error('Invalid id');
            if (translationExport.subtitleUrl) throw new Error('A subtitled video has already been generated for this translation');
            if (translationExport.subtitleProgress) throw new Error('Burning subtitles is already in progress');
            return next();
        })
        .catch((err) => {
            console.log(err);
            return res.status(400).send(err.message);
        })
    },

    validateBurnSubtitles: (req, res, next) => {
        const { translationExportId } = req.params;
        TranslationExport.findById(translationExportId)
        .then((translationExport) => {
            if (!translationExport) throw new Error('Invalid id');
            if (translationExport.subtitledVideoUrl) throw new Error('A subtitled video has already been generated for this translation');
            if (translationExport.subtitledVideoProgress) throw new Error('Burning subtitles is already in progress');
            return next();
        })
        .catch((err) => {
            console.log(err);
            return res.status(400).send(err.message);
        })
    }
}
module.exports = middlewares;