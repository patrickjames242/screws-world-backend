

exports.HTTPErrorCodes = {
    serverError: 500,
    badRequest: 400,
    invalidAuthentication: 401,
    resourceNotFound: 404,
    incorrectUsernameOrPassword: 403,
}


exports.SuccessResponse = function(data) {
    return {
        status: 'success',
        data: data,
    }
}

exports.FailureResponse = function(errorMessage, errorType) {
    return {
        status: 'failure',
        errorMessage,
        errorType,
    }
}

exports.sendErrorResponseToClient = function(response, error){
    response.status(exports.HTTPErrorCodes.serverError).json(exports.FailureResponse("A server error occured. Here it is 👉🏽 " + error.message));
}

exports.promiseCatchCallback = function(response){
    return (error) => {
        exports.sendErrorResponseToClient(response, error);
    }
}


exports.isValidEmail = function(email){
    // I got this regex from here: https://emailregex.com/
    const emailRegex = /(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])/
    return emailRegex.test(email);
}




