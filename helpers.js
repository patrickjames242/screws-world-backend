

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

exports.promiseCatchCallback = function(response){
    return (error) => {
        response.status(exports.HTTPErrorCodes.serverError).json(exports.FailureResponse("A server error occured. Here it is 👉🏽 " + error.message));
    }
}




