const uuid = require('uuid').v4;
const User = require('../shared/models').User;

const {
  authService,
  articleService,
  notificationService,
  userService,
} = require('../shared/services');

const controller = {

    respondToOrganizationInvitation: function(req, res) {
        const { inviteToken, email, status } = req.body;
        const { organizationId } = req.params;
        let user;
        let tempuUserPass = uuid();
        userService.getUserByEmail(email)
        .then((userDoc) => {
            if (!userDoc) throw new Error('Invalid user');
            return new Promise((resolve, reject) => {
                user = userDoc;
                if (user.toObject) {
                    user = user.toObject();
                }
                
                User.find({ _id: user._id })
                .select('+organizationRoles.inviteToken')
                .then(users => {
                    const userDataWithToken = users[0];
                    const userRole = userDataWithToken.organizationRoles.find((role) => role.organization.toString() === organizationId);
                    if (!userRole) throw new Error('Invalid invitation');
                    if (userRole.inviteToken !== inviteToken) throw new Error('Invalid token');
                    const userRoleIndex = user.organizationRoles.findIndex((role) => role.organization._id.toString() === organizationId);
                    const newOrgRoles = user.organizationRoles;

                    if (!status || ['accepted', 'declined'].indexOf(status) === -1) {
                        throw new Error('Invalid status. accepted|declined');
                    }

                    newOrgRoles[userRoleIndex].inviteStatus = status;

                    const userUpdate = {
                        [`organizationRoles.${userRoleIndex}.inviteStatus`]: status,
                        emailVerified: true,
                    }

                    user = { ...user, emailVerified: true, organizationRoles: newOrgRoles };
                    return userService.update({ email }, userUpdate)
                })
                .then(resolve)
                .catch(reject)
            })
        })
        .then(() => {
            return new Promise((resolve, reject) => {
                if (status === 'declined') return resolve();
                authService.encryptPassword(tempuUserPass)
                .then(password => {
                  if (!user.passwordSet) {
                    return userService.update({ email }, { password })
                  } else {
                    return Promise.resolve();
                  }
                })
                .then(() => {
                  return authService.generateLoginToken(user._id)
                })
                .then(resolve)
                .catch(reject)
            })
        })
        .then((token) => {
            userService.getUserByEmail(email)
            .then((userDoc) => {
                user = userDoc;
                const response = {
                    success: true,
                    user,
                    token,
                }

                if (!user.passwordSet && status === 'accepted') {
                    response.setPassword = true;
                    response.tempPass = tempuUserPass;
                }
                return res.json(response);
            })
        })
        .catch((err) => {
            console.log(err);
            return res.status(400).send(err.message);
        })
    },

    updateTranslatorInvitation: function(req, res) {
        const { articleId } = req.params;
        const { status, inviteToken, email } = req.body;
        let speakerNumber;
        let user;
        let article;
        let speakerTranslation;
        userService.getUserByEmail(email)
        .then((userDoc) => {
            if (!userDoc) throw new Error('Invalid email');
            user = userDoc;
            return articleService.findById(articleId);
        })
        .then((articleDoc) => {
            if (!articleDoc) throw new Error('Invalid article id');
            article = articleDoc;
            const translators = article.translators;
            speakerTranslation = translators.find(t => t.inviteToken === inviteToken);
            if (!speakerTranslation) throw new Error('Expired token');
            if (speakerTranslation.user.toString() !== user._id.toString()) throw new Error("You're not assigned for this speaker");
            speakerTranslation.invitationStatus = status;
            // Remove invitation token
            // speakerTranslation.inviteToken = '';
            speakerNumber = speakerTranslation.speakerNumber;
            return articleService.update({ _id: articleId }, { translators });
        })
        .then(() => {
            // Update notification for the user if it exists
            return authService.generateLoginToken(user._id)
        })
        .then((token) => {
            res.json({ success: true, token, user, speakerNumber });

            // Update user's notification status
            notificationService
            .update({ owner: user._id, resource: articleId, inviteToken, type: 'invited_to_translate' }, { status })
            .then((r) => {
                console.log('updated notification status', r)
            })
            .catch(err => {
                console.log('error updating notification status', err);
            })
            // Send notification to the admin who invited that user
            userService.findById(speakerTranslation.invitedBy)
            .then((inviterData) => {
                const notificationData = {
                    owner: speakerTranslation.invitedBy,
                    organization: article.organization,
                    from: user._id,
                    type: status === 'accepted' ? 'invited_to_translate_accepted' : 'invited_to_translate_declined',
                    content: `${user.email} has ${status} the invitation to translate the video "${article.title}" (${article.langCode})`,
    
                    resource: articleId,
                    resourceType: 'article',
                }
                notificationService.notifyUser({ email: inviterData.email, organization: article.organization }, notificationData)
                .then((doc) => {
                    console.log('created notification', doc)
                })
            })
            .catch((err) => {
                console.log('error creating notification', err);
            })
        })
        .catch(err => {
            console.log(err);
            return res.status(400).send(err.message);
        })
    },

    updateTextTranslatorInvitation: function(req, res) {
        const { articleId } = req.params;
        const { status, inviteToken, email } = req.body;
        console.log(req.body)
        let user;
        let article;
        let speakerTranslation;
        userService.getUserByEmail(email)
        .then((userDoc) => {
            if (!userDoc) throw new Error('Invalid email');
            user = userDoc;
            return articleService.findById(articleId);
        })
        .then((articleDoc) => {
            if (!articleDoc) throw new Error('Invalid article id');
            article = articleDoc;
            const textTranslators = article.textTranslators;
            console.log(textTranslators)
            speakerTranslation = textTranslators.find(t => t.inviteToken === inviteToken);
            if (!speakerTranslation) throw new Error('Expired token');
            if (speakerTranslation.user.toString() !== user._id.toString()) throw new Error("You're not assigned for this speaker");
            speakerTranslation.invitationStatus = status;
            // Remove invitation token
            // speakerTranslation.inviteToken = '';
            return articleService.update({ _id: articleId }, { textTranslators });
        })
        .then(() => {
            // Update notification for the user if it exists
            return authService.generateLoginToken(user._id)
        })
        .then((token) => {
            res.json({ success: true, token, user });

            // Update user's notification status
            notificationService
            .update({ owner: user._id, resource: articleId, inviteToken, type: 'invited_to_translate_text' }, { status })
            .then((r) => {
                console.log('updated notification status', r)
            })
            .catch(err => {
                console.log('error updating notification status', err);
            })
            // Send notification to the admin who invited that user
            userService.findById(speakerTranslation.invitedBy)
            .then((inviterData) => {
                const notificationData = {
                    owner: speakerTranslation.invitedBy,
                    organization: article.organization,
                    from: user._id,
                    type: status === 'accepted' ? 'invited_to_translate_text_accepted' : 'invited_to_translate_text_declined',
                    content: `${user.email} has ${status} the invitation to translate the video "${article.title}" (${article.langCode})`,
    
                    resource: articleId,
                    resourceType: 'article',
                }
                notificationService.notifyUser({ email: inviterData.email, organization: article.organization }, notificationData)
                .then((doc) => {
                    console.log('created notification', doc)
                })
            })
            .catch((err) => {
                console.log('error creating notification', err);
            })
        })
        .catch(err => {
            console.log(err);
            return res.status(400).send(err.message);
        })
    },

}

module.exports = controller;