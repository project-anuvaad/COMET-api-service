
const fs = require('fs');
const jwt = require('jsonwebtoken');
const uuid = require('uuid').v4;
const sha256 = require('sha256');

const emailService = require('./services/email');
const storageService = require('../shared/services/storage');

const userService = require('../shared/services/user');
const organizationService = require('../shared/services/organization');
const { User } = require('../shared/models');

const DEFAULT_EXPIRE_TIME = '48h';
const SECRET_STRING = process.env.SECRET_STRING;
const VW_SUPER_TRANSCRIBERS_EMAILS = process.env.VW_SUPER_TRANSCRIBERS_EMAILS && process.env.VW_SUPER_TRANSCRIBERS_EMAILS.split(',').length > 0 ? process.env.VW_SUPER_TRANSCRIBERS_EMAILS.split(',').map(r => r.trim()).filter(r => r) : [];

function validateRegData ({ email, firstname, lastname, password, orgName }) {
    return new Promise((resolve, reject) => {
        /*  eslint-disable no-useless-escape */
        let mailformat = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,5})+$/;
        let isEmailOk = email.match(mailformat);

        if (!isEmailOk) {
            return resolve({
                message: 'Invalid email format',
                isValid: false
            })
        }


        let isPasswordOk = password.length >= 8;

        if (!isPasswordOk) {
            return resolve({
                message: 'Password must be at least 8 characters',
                isValid: false
            })
        }

        let isOrgNameOk = orgName.length > 1;

        if (!isOrgNameOk) {
            return resolve({
                message: 'Invalid Organization Name',
                isValid: false
            })
        }

        let isFirstnameOk = firstname && firstname.length > 1;
        let isLastnameOk = lastname && lastname.length > 1;


        if (!isFirstnameOk) {
            return resolve({
                message: 'First name is a required field',
                isValid: false,
            })
        }

        if (!isLastnameOk) {
            return resolve({
                message: 'Last name is a required field',
                isValid: false,
            })
        }
        userService.find({ email })
        .then((usersData) => {
            if (usersData && usersData.length > 0) {
                return resolve({
                    message: 'User Already Available',
                    isValid: false
                })
            }
            organizationService.find({ name: orgName })
            .then((organizations) => {
                if (organizations && organizations.length > 0) {
                    return resolve({
                        message: `Organization named ${orgName} already exists, Please enter a different name`,
                        isValid: false
                    })
                }
                return resolve({ isValid: true });
            })
            .catch(reject);
            
        })
        .catch(reject);
    })
}

function generateLoginToken (userId, temp) {
    return new Promise((resolve, reject) => {
        userService.findById(userId)
            .then(user => {
                jwt.sign({ email: user.email, _id: user._id }, SECRET_STRING, { expiresIn: temp ? '1m' : DEFAULT_EXPIRE_TIME }, (err, encoded) => {
                    if (err) {
                        return reject(err);
                    }
                    return resolve(encoded);
                })
            })
            .catch(err => {
                reject(err);
            })
    })
}

function refreshToken(token) {
    return new Promise((resolve, reject) => {
        jwt.verify(token, process.env.SECRET_STRING, (err, user) => {
            if (err) {
                console.log('decodeApiToken - error ', err);
                return reject(new Error('Invalid token signature'));
            }
            console.log('user is', user)
            const { email, _id } = user;

            jwt.sign({ email, _id }, SECRET_STRING, { expiresIn: DEFAULT_EXPIRE_TIME }, (err, newToken) => {
                if (err) return reject(err);
                return resolve({ token: newToken, data: { email } });
            })
        })
    })
}

function decodeToken(token) {
    return new Promise((resolve, reject) => {
        jwt.verify(token, process.env.SECRET_STRING, (err, user) => {
            if (err) {
                console.log('decodeApiToken - error ', err);
                return reject(new Error('Invalid token signature'));
            }
            return resolve(user);
        })
    })
}

module.exports = {
    encryptPassword: function(req, res) {
        const { password } = req.body;
        return res.json(sha256(password));
    },

    registerUser: function (req, res) {
        const { email, password, firstname, lastname, orgName } = req.body;
        const logo = req.files.find((f) => f.fieldname === 'logo');
        let organization;
        validateRegData({ email, firstname, lastname, password, orgName })
        .then(({ isValid, message }) => {
            if (!isValid) {
                throw new Error(message);
            }
            // Create organization
            return organizationService.create({ name: orgName })
        })
        .then(organizationData => {
            organization = organizationData.toObject();
            // Create user
            const orgRole = {
                organization: organization._id,
                organizationOwner: true,
            };
            const usersData = {
                firstname,
                lastname,
                email,
                password: sha256(password),
                passwordSet: true,
                organizationRoles: [orgRole],
                superTranscriber: VW_SUPER_TRANSCRIBERS_EMAILS.indexOf(email.trim()) !== -1
            }
            return userService.create(usersData)
        })
        .then(() => {
            return new Promise((resolve) => {
                // Upload organization logo if exists
                if (!logo) {
                    return resolve();
                }
                storageService.saveFile('logos', `${orgName}-logo-${uuid()}.${logo.filename.split('.').pop()}`, fs.createReadStream(logo.path))
                .then((uploadRes) => {
                    return organizationService.update({ name: orgName }, { logo: uploadRes.url });
                })
                .then(() => {
                    resolve();
                })
                .catch((err) => {
                    console.log(err);
                    resolve();
                })
            })
        })
        .then(() => {
            return res.json({ success: true, message: 'success' });
        })
        .catch(err => {
            console.log(err);
            return res.status(400).send(err.message);
        })
    },

    loginUser: async function (req, res) {
        let { email, password, temp } = req.body;
        let token;
        let user;
        User.find({ email })
        .select('+password')
        .then((usersData) => {
            if (!usersData || usersData.length === 0) {
                throw new Error('Invalid email or password');
            }
            user = usersData[0];
            if (sha256(password) !== user.password) {
                throw new Error('Invalid email or password');
            }
            return generateLoginToken(user._id, temp);
        })
        .then((t) => {
            token = t;
            return userService.getUserByEmail(email);
        })
        .then(userData => {
            return res.status(200).send({ success: true, token, user: userData });
        })
        .catch(err => {
            console.log(err);
            return res.status(400).send(err.message);
        })
    },
    
    resetPassword: function(req, res) {
        const { email } = req.body;

        let user;
        let resetCode;
        userService.findOne({ email })
        .then((userDoc) => {
            if (!userDoc) throw new Error('This email is not registered');
            user = userDoc.toObject();
            resetCode = sha256(uuid());
            return userService.update({ email }, { resetCode })
        })
        .then(() => {
            return emailService.resetUserPassord({ to: user, resetCode })
        })
        .then(() => {
            return res.json({ success: true });
        })
        .catch(err => {
            console.log(err);
            return res.status(400).send(err.message);
        })
    },

    generateLoginToken: (req, res) => {
        const { userId, temp } = req.body;
        generateLoginToken(userId, temp)
        .then(data => {
            return res.json(data);
        })
        .catch(err => {
            console.log(err);
            return res.status(400).send(err.message);
        })
    },

    refreshToken: function(req, res) {
        const { token } = req.body;
        let newToken;
        refreshToken(token)
        .then((tokenData) => {
            const { token, data } = tokenData;
            newToken = token;
            return userService.getUserByEmail(data.email);
        })
        .then(user => {
            return res.json({ success: true, token: newToken, user: user });
        })
        .catch(err => {
            console.log(err);
            return res.status(400).send('Invalid token');
        })
    },

    decodeToken: function(req, res) {
        const { token } = req.body;

        decodeToken(token)
        .then(user => {
            return res.json(user);
        })
        .catch(err => {
            console.log(err);
            return res.status(400).send('Invalid token');
        })

    }
}