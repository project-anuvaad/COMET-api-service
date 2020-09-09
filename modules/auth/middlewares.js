const {
  DISABLE_PUBLIC_ORGANIZATIONS,
} = process.env;

const middlewares = {
  authorizeRegister: function(req, res, next) {
    if (
      DISABLE_PUBLIC_ORGANIZATIONS &&
      parseInt(DISABLE_PUBLIC_ORGANIZATIONS) === 1
      ) {
        return res.status(403).send('Direct registeration is disabled')
    } else {
      return next();
    }
  },
};

module.exports = middlewares;
