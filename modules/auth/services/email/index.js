const path = require('path')
const ejs = require('ejs');
const emailVendor = require('../../vendors/email');

const { FRONTEND_HOST_NAME, FRONTEND_HOST_PROTOCOL } = process.env


const resetUserPassord = ({ to, resetCode }) => {
    return new Promise((resolve, reject) => {
        const subject = `Videowiki: Reset Password`

        const renderData = {
            resetPasswordUrl: `${FRONTEND_HOST_PROTOCOL}://${FRONTEND_HOST_NAME}/rp?rc=${resetCode}&email=${to.email}`,
            userName: `${to.firstname} ${to.lastname}`,
            userEmail: to.email,
        }
        ejs.renderFile(path.join(__dirname, 'templates', 'reset_password.ejs'), renderData, (err, htmlToSend) => {
            if (err) return reject(err);
            // setup e-mail data, even with unicode symbols
            const mailOptions = {
                from: 'Videowiki <help@videowiki.org>',
                to: to.email,
                subject,
                html: htmlToSend
            };

            emailVendor.send(mailOptions, function (error, body) {
                console.log(error, body);
                if (err) return reject(err);
                return resolve(body);
            })
        })
    })
}

module.exports = {
    resetUserPassord,
}