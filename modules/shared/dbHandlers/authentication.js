const {User} = require('../models/');
const {Organization} = require('../models/');
const {OrgRole} = require('../models/');

const sha256 = require('sha256');

const addUser = async (userDetail) => {
    let organization = Organization({
        name: userDetail.orgName ? userDetail.orgName : '',
        logo: userDetail.logo ? userDetail.logo : ''
    });

    let orgRole = OrgRole({
        organization: organization,
        organizationOwner: userDetail.organizationOwner ? userDetail.organizationOwner : false
    });

    let newUser = User({
        firstname: userDetail.firstname ? userDetail.firstname : '',
        lastname: userDetail.lastname ? userDetail.lastname : '',
        email: userDetail.email ? userDetail.email : '',
        password: sha256(userDetail.password ? userDetail.password : ''),
        passwordSet: true,
        organizationRoles: [orgRole]
    });

    await newUser.save();
    await organization.save();
    const userFromDb = await User.findOne({ email: userDetail.email });
    return userFromDb.email === userDetail.email;
}

const checkUser = async (email) => {
    const userFromDb = await User.findOne({email: email});

    if (userFromDb !== null) {
        return userFromDb['email'] === email;
    }

    return false;
}

const checkOrganization = async (name) => {
    const organization = await Organization.findOne({name});
    return !!organization;
}

const validateLogin = async (email, password) => {
    const userFromDb = await User.findOne({email: email}).select('+password');

    if (userFromDb !== null) {
        return userFromDb['password'] === sha256(password);
    }

    return false;
}

module.exports = {
    addUser,
    checkUser,
    validateLogin,
    checkOrganization
};
