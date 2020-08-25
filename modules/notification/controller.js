const {
  userService,
} = require('../shared/services');
const async = require('async');

const Notification = require('../shared/models').Notification;

const controller = {
    
    getNotifications: function(req, res) {
        const perPage = 10;
        let { page, organization } = req.query;

        if (page) {
            page = parseInt(page);
        } else {
            page = 1;
        }
        const skip = page === 1 || page === 0 ? 0 : (page * perPage - perPage);
        const query = {
            owner: req.user._id,
            organization,
        }
        let count;
        Notification.count(query)
        .then((c) => {
            count = c || 0;
            return Notification.find({ ...query })
                .sort({ created_at: -1 })
                .skip(skip)
                .limit(perPage)
        })
        .then((notifications) => {
            notifications = notifications.map(n => n.toObject());
            const fetchFromFuncArray = notifications.map(notification => cb => {
                if (notification.from) {
                    userService.findById(notification.from)
                    .then((userData) => {
                        notification.from = {
                            firstname: userData.firstname,
                            lastname: userData.lastname,
                            email: userData.email,
                        }
                        cb();
                    })
                    .catch(err => {
                        console.log(err);
                        notification.from = null;
                        cb()
                    })
                } else {
                    cb();
                }
            })
            async.parallelLimit(fetchFromFuncArray, 2, () => {
                return res.json({ notifications, pagesCount: Math.ceil(count/perPage) });
            })
        })
        .catch(err => {
            console.log(err);
            return res.status(400).send(err.message);
        })
    },

    getUnreadCount: function(req, res) {
        const { organization } = req.query;
        const query = {
            owner: req.user._id,
            organization,
            read: false,
        }
        Notification.count(query)
        .then((count) => {
            return res.json({ count });
        })
        .catch(err => {
            console.log(err);
            return res.status(400).send(err.message);
        })
    },
    
    setNotificationsRead: function(req, res) {
        const { organization } = req.body;
        const query = {
            owner: req.user._id,
            organization
        }

        Notification.update(query, { $set: { read: true } }, { multi: true })
        .then(() => {
            return res.json({ success: true });
        })
        .catch((err) => {
            console.log(err);
            return res.status(400).send(err.message);
        })
    }
   
}


module.exports = controller;
