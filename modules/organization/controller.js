const uuid = require('uuid').v4;
const _ = require('lodash');
const fs = require('fs');
const Organization = require('../shared/models').Organization;

const {
  storageService,
  userService,
  emailService
} = require('../shared/services');

const { handlePromiseReject, validateEmail } = require('./utils');
const { User } = require('../shared/models');

const controller = {
    getById: function(req, res) {
        const { organizationId } = req.params;
        Organization.findById(organizationId)
        .then((organization) => {
            if (!organization) throw new Error('Invalid organization id');
            return res.json({ organization: organization.toObject() });
        })
        .catch(err => {
            console.log(err);
            return res.status(400).send('Something went wrong');
        })
    },

    createOrganization: function(req, res) {
        const { name } = req.body;
        let logo;
        if (req.files) {
            logo = req.files.find((file) => file.fieldname === 'logo')
        }
        let newOrganization;
        let organizationRoles;
        Organization.find({ name })
        .then((organizations) => {
            if (organizations && organizations.length > 0) {
                console.log(organizations)
                throw new Error('This organization name is already taken, please try a different name');
            }
            if (!logo) {
                return Organization.create({ name })
            }
            return new Promise((resolve, reject) => {
                storageService.saveFile('logos', logo.filename, fs.createReadStream(logo.path))
                .then((result) => {
                    const { url } = result;
                    return Organization.create({ name, logo: url });  
                })
                .then(resolve)
                .catch(reject);
            })
        })
        .then((newOrganizationDoc) => {
            newOrganization = newOrganizationDoc.toObject();
            return userService.getUserByEmail(req.user.email);
        })
        .then(user => {
            organizationRoles = user.organizationRoles;
            organizationRoles.push({
                organization: newOrganization._id,
                organizationOwner: true,
            })

            return userService.update({ _id: user._id }, { organizationRoles })
        })
        .then(() => {
            return res.json({ organization: newOrganization, organizationRoles })
        })
        .catch(err => {
            console.log(err);
            return res.status(400).send(err.message);
        })
    },

    updateLogo: function(req, res) {
        const { organizationId } = req.params;
        const logo = req.file;
        let organization;
        let oldLogo;
        Organization.findById(organizationId)
        .then((orgDoc) => {
            if (!orgDoc) throw new Error('Invalid organization id');
            organization = orgDoc.toObject();
            if (organization.logo) {
                oldLogo = organization.logo;
            }

            return storageService.saveFile('logos', logo.filename, fs.createReadStream(logo.path));
        })
        .then((result) => {
            const { url } = result;
            organization.logo = url;
            return Organization.update({ _id: organizationId }, { $set: { logo: url } });
        })
        .then(() => {
            return res.json({ organization });
        })
        .catch(err => {
            console.log(err);
            return res.status(400).send(err.message);
        })
    },

    respondToInvitationAuth: function(req, res) {
        const { organizationId } = req.params;
        let user = req.user;
        userService.findById(user._id)
        .then((userDoc) => {
            if (!userDoc) throw new Error('Invalid user');
            user = userDoc.toObject();
            const userRole = user.organizationRoles.find((role) => role.organization.toString() === organizationId);
            if (!userRole) throw new Error('Not in organization');
            const userRoleIndex = user.organizationRoles.findIndex((role) => role.organization.toString() === organizationId);
            const newOrgRoles = user.organizationRoles;

            newOrgRoles[userRoleIndex].inviteStatus = 'accepted';
            const userUpdate = {
                [`organizationRoles.${userRoleIndex}.inviteStatus`]: 'accepted',
            }

            return userService.findByIdAndUpdate(user._id, userUpdate); 
        })
        .then(() => {
            return res.json({ success: true });
        })
        .catch((err) => {
            console.log(err);
            return res.status(400).send(err.message);
        })
    },

    addUser: async function (req, res) {
        let {organizationId} = req.params;
        const { email, firstname, lastname, permissions } = req.body;

        let isEmailValid = validateEmail(email);
        const user = await userService.getUserByEmail(email);

        if (!isEmailValid) {
            return res.json({
                success: false,
                message: 'Invalid email address'
            });
        }

        if (user) {
            const userOrganizations = user.organizationRoles;

            const role = _.find(userOrganizations, (i) => {
                return i.organization.toString() === organizationId.toString();
            });

            if (role) {
                return res.json({
                    success: false,
                    message: 'User already assigned to your organization'
                });
            }

            const inviteToken = `${uuid()}_${uuid()}`
            const userRoles = user.organizationRoles;

            userRoles.push({
                inviteStatus: 'pending',
                organization: organizationId,
                organizationOwner: false,
                permissions,
                inviteToken,
            })
            
            const { err: updateErr, data: userData } = await handlePromiseReject(userService.update({ _id: user._id }, { organizationRoles: userRoles }));
            if (updateErr) {
                console.log(updateErr)
                return res.status(400).send('Something went wrong')
            }
            
            res.json({ success: true, user });
            // Send invitation email
            const { err, data: organization } = await handlePromiseReject(Organization.findById(organizationId))
            if (err) {
                return console.log(err);
            }
            emailService.inviteUserToOrganization({ from: req.user, to: user, organization, inviteToken })
            .then(() => {
                console.log('Invitiation sent');
            })
            .catch((err) => {
                console.log(err);
            })
        } else {
            let orgRole = {
                organization: organizationId,
                organizationOwner: false,
                permissions,
                inviteStatus: 'pending',
                inviteToken: `${uuid()}_${uuid()}`,
            };

            let newUser = {
                firstname,
                lastname,
                email,
                emailVerified: false,
                organizationRoles: [orgRole]
            };

            const { err: createErr, data: user } = await handlePromiseReject(userService.create(newUser));
           
            if (createErr) {
                console.log(createErr);
                return res.status(400).send('something went wrong');
            }

            if (user) {
                res.json({
                    success: true,
                    user
                });

                // Send invitation email
                const { err, data: organization } = await handlePromiseReject(Organization.findById(organizationId))
                if (err) {
                    console.log(err);
                } else {
                    emailService.inviteUserToOrganization({ from: req.user, to: user, organization, inviteToken: orgRole.inviteToken })
                        .then(() => {
                            console.log('Invitiation sent to ', user.email);
                        })
                        .catch((err) => {
                            console.log(err);
                        })
                }
            } else {
                res.status(400).send('Something went wrong')
            }
        }

    },

    removeUser: async function (req, res) {

        const { organizationId, userId } = req.params;
        User.find({ _id: userId })
        .select('+organizationRoles.inviteToken ')
        .then((usersDoc) => {
            if (!usersDoc) throw new Error('Invalid email');
            const userDoc = usersDoc[0];
            if (!getUserOrganizationRole(userDoc, organizationId)) throw new Error('User not in the organization');
            const newOrgRoles = userDoc.organizationRoles.filter((role) => role.organization && role.organization.toString() !== organizationId);
            return userService.update({ _id: userId }, { organizationRoles: newOrgRoles });
        })
        .then(() => {
            res.status(200).send({ success: true, msg: 'success' });
        })
        .catch(err => {
            console.log(err);
            return res.status(400).send(err.message);
        })
    },

    editPermissions: async (req, res) => {
        const { permissions } = req.body;
        const { userId, organizationId } = req.params;
        userService.findById(userId)
        .then((userDoc) => {
            if (!userDoc) throw new Error('Invalid user id');
            if (!getUserOrganizationRole(userDoc, organizationId)) throw new Error('User not in the organization');
            const roleIndex = userDoc.organizationRoles.findIndex((role) => role.organization.toString() === organizationId);
            return userService.update({ _id: userId }, { [`organizationRoles.${roleIndex}.permissions`]: permissions });
        })
        .then(() => {
            
            return res.json({
                success: true
            });
        })
        .catch(err => {
            console.log(err);
            return res.status(400).send(err.message);
        })
    },



}

function getUserOrganizationRole(user, organizationId) {
    return user.organizationRoles.find((role) => role.organization.toString() === organizationId)
}

module.exports = controller;