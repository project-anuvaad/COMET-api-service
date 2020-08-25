function validateEmail(email) {
  let mailformat = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
  return email.match(mailformat)
}

function handlePromiseReject (promise) {
  return new Promise((resolve) => {
      promise.then((data) => resolve({ data }))
          .catch(err => resolve({ err }));
  })
}

module.exports = {
  handlePromiseReject,
  validateEmail
}