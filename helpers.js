


exports.HTTPErrorCodes = {
    serverError: 500,
    badRequest: 400,
    invalidAuthentication: 401,
    resourceNotFound: 404,
    incorrectUsernameOrPassword: 403,
}

exports.errorTypes = {
    invalidAuthToken: "invalid_auth_token",
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

exports.promiseCatchCallback = function(response){
    return (error) => {
        response.status(exports.HTTPErrorCodes.serverError).json(exports.FailureResponse("A server error occured. Here it is 👉🏽 " + error.message));
    }
}


// replaces the id string with a number if it is valid, sends an error and returns null if it isn't;
exports.validateIDMiddleware = function(request, response, next) {
    const id = Number(request.params.id);
    if (isNaN(id) === true) {
        response.status(exports.HTTPErrorCodes.badRequest).json(exports.FailureResponse(`the id of '${request.params.id}' is invalid`));
        return;
    } else {
        request.params.id = id;
        next();
    }
}

