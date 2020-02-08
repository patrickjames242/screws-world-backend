
const express = require('express');
const { HTTPErrorCodes, SuccessResponse, FailureResponse, promiseCatchCallback } = require('./helpers.js');
const databaseClient = require('./databaseClient.js');
const { requireAuthentication } = require('./authentication');
const mime = require('mime-types');
const AWS = require('aws-sdk');
const getUUID = require('uuid/v4');


const AWS_S3_Helpers = {

    BUCKET_NAME: "screws-world-backend",
    PRODUCT_ITEM_IMAGE_FOLDER: "product-item-images",

    api: new AWS.S3({
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_KEY_ID,
    }),

    uploadProductItemImage: async (fileExtension, body) => {
        return new Promise((resolve, reject) => {
            const params = {
                Bucket: AWS_S3_Helpers.BUCKET_NAME,
                Key: AWS_S3_Helpers.PRODUCT_ITEM_IMAGE_FOLDER + "/" + getUUID() + fileExtension,
                Body: body,
            };
            AWS_S3_Helpers.api.upload(params, function (error, result) {
                error != null ? reject(error) : resolve(result);
            });
        });
    },

    deleteProductItemImage: async (fileKey) => {
        return new Promise((resolve, reject) => {
            const params = {
                Bucket: AWS_S3_Helpers.BUCKET_NAME,
                Key: fileKey,
            };
            AWS_S3_Helpers.api.deleteObject(params, function (error, result) {
                error != null ? reject(error) : resolve(result);
            });
        });
    }
};


exports.categoryInfo = {
    name: "category",
    tableName: "product_categories",
}

exports.productInfo = {
    name: "product",
    tableName: "products",
}

// replaces the id string with a number if it is valid, sends an error and returns null if it isn't;
const validateIDMiddleware = function (request, response, next) {
    const id = Number(request.params.id);
    if (isNaN(id) === true) {
        response.status(HTTPErrorCodes.badRequest).json(FailureResponse(`The id of '${request.params.id}' is invalid.`));
        return;
    } else {
        request.params.id = id;
        next();
    }
}






exports.getRouterForCategoryOrProduct = function (categoryOrProductInfo) {

    const router = express.Router();

    function sendIdDoesNotExistFailure(request, response) {
        response.status(HTTPErrorCodes.resourceNotFound).json(FailureResponse(`No ${categoryOrProductInfo.name} exists with id of ${request.params.id}.`));
    }

    async function doesIDExist(id) {
        return databaseClient.query(`select exists(select 1 from ${categoryOrProductInfo.tableName} where id = $1)`, [id])
            .then(({ rows: [firstRow] }) => {
                if (firstRow && firstRow.exists) {
                    return true;
                } else {
                    return false;
                }
            }).catch((error) => {
                return false;
            });
    }



    router.use("/:id", validateIDMiddleware);

    // get all items

    const propertiesToFetch = "id, title, description, parent_category, image_url";

    router.get('/', (_, response) => {
        databaseClient.query(`select ${propertiesToFetch} from ${categoryOrProductInfo.tableName}`)
            .then(({ rows }) => {
                response.json(SuccessResponse(rows));
            }).catch(promiseCatchCallback(response));
    });


    // get item for id

    router.get('/:id', (request, response) => {
        const id = request.params.id;
        databaseClient.query(`select ${propertiesToFetch} from ${categoryOrProductInfo.tableName} where id = ${id}`)
            .then(({ rows: [firstRow] }) => {
                if (firstRow) {
                    response.json(SuccessResponse(firstRow));
                } else {
                    sendIdDoesNotExistFailure(request, response);
                }
            }).catch(promiseCatchCallback(response));
    });




    // create new item

    router.post('/', requireAuthentication, (request, response) => {

        const props = request.body;

        if (props.title == undefined) {
            response.status(HTTPErrorCodes.badRequest).json(FailureResponse("The 'title' property is required, but you have not included it."));
            return;
        }

        const propsToUse = [
            { key: "title", value: props.title },
            { key: "description", value: props.description },
            { key: "parent_category", value: props.parent_category },
        ].filter(x => x.value !== undefined);

        const propNamesString = `(${propsToUse.map(x => x.key).join(", ")})`;
        const valuesString = `(${propsToUse.map((_, i) => "$" + (i + 1)).join(", ")})`;
        const values = propsToUse.map(x => x.value);

        databaseClient.query(`insert into ${categoryOrProductInfo.tableName} ${propNamesString} values ${valuesString} returning ${propertiesToFetch}`, values)
            .then(({ rows: [firstRow] }) => {
                response.json(SuccessResponse(firstRow));
            }).catch(promiseCatchCallback(response));
    });


    // update already existing item

    router.put('/:id', requireAuthentication, (request, response) => {
        const id = request.params.id;
        const props = request.body;
        const propsToUse = [
            { key: "title", value: props.title },
            { key: "description", value: props.description },
            { key: "parent_category", value: props.parent_category },
        ].filter(x => x.value !== undefined);
        if (propsToUse.length === 0) {
            response.status(HTTPErrorCodes.badRequest).json(FailureResponse("You didn't send any valid properties to update the object with."));
            return;
        }

        const values = propsToUse.map(x => x.value);

        const setPropsString = propsToUse.map((x, i) => `${x.key} = $${i + 1}`).join(", ");

        databaseClient.query(`update ${categoryOrProductInfo.tableName} set ${setPropsString} where id = ${id} returning ${propertiesToFetch}`, values)
            .then(({ rows: [affectedRow] }) => {
                if (affectedRow) {
                    response.json(SuccessResponse(affectedRow));
                } else {
                    sendIdDoesNotExistFailure(request, response);
                }
            }).catch(promiseCatchCallback(response));
    });


    // update item photo

    router.put('/:id/image', requireAuthentication, (request, response) => {

        if (request.body instanceof Buffer === false) {
            response.status(HTTPErrorCodes.badRequest).json(FailureResponse("Either you have not included a body with the request or the body you have included is invalid."));
            return;
        }

        databaseClient.query(`select * from ${categoryOrProductInfo.tableName} where id = $1`, [request.params.id])
            .then(({ rows: [firstRow] }) => {

                if (firstRow == undefined) {
                    sendIdDoesNotExistFailure(request, response);
                    return;
                }

                const fileExtension = (() => {
                    let extension = mime.extension(request.headers["content-type"]);
                    if (extension === false) {
                        return "";
                    } else {
                        return "." + extension;
                    }
                })();

                if (firstRow.image_aws_key) {
                    AWS_S3_Helpers.deleteProductItemImage(firstRow.image_aws_key)
                        .then(() => { /* dont care what happens here */ })
                        .catch(() => { /* dont care what happens here */ })
                }

                AWS_S3_Helpers.uploadProductItemImage(fileExtension, request.body)
                    .then((result) => {
                        const url = result.Location;
                        const key = result.key;

                        return databaseClient.query(`update ${categoryOrProductInfo.tableName} set image_aws_key = $1, image_url = $2 where id = $3 returning ${propertiesToFetch}`, [key, url, request.params.id]);

                    }).then((dbResult) => {
                        const firstRow = dbResult.rows[0];

                        if (firstRow == undefined) {
                            sendIdDoesNotExistFailure(request, response);
                            AWS_S3_Helpers.deleteProductItemImage(key)
                                .then(() => { /* dont care what happens here */ })
                                .catch(() => { /* dont care what happens here */ })
                            return;
                        }

                        response.json(SuccessResponse(firstRow));

                    }).catch(promiseCatchCallback(response));
            }).catch(promiseCatchCallback(response));
    });


    // delete image

    router.delete('/:id/image', requireAuthentication, (request, response) => {
        databaseClient.query(`select * from ${categoryOrProductInfo.tableName} where id = $1`, [request.params.id])
            .then(({ rows: [firstRow] }) => {

                if (firstRow == undefined) {
                    sendIdDoesNotExistFailure(request, response);
                    return;
                }

                if (firstRow.image_aws_key) {
                    AWS_S3_Helpers.deleteProductItemImage(firstRow.image_aws_key)
                        .then(() => { /* dont care what happens here */ })
                        .catch(() => { /* dont care what happens here */ })
                }

                databaseClient.query(`update ${categoryOrProductInfo.tableName} set image_aws_key = null, image_url = null where id = $1 returning ${propertiesToFetch}`, [request.params.id])
                    .then(({ rows: [firstRow] }) => {
                        if (firstRow) {
                            response.json(SuccessResponse(firstRow));
                        } else {
                            sendIdDoesNotExistFailure(request, response);
                        }
                    }).catch(promiseCatchCallback(response));

            }).catch(promiseCatchCallback(response));
    });






    // delete item

    router.delete('/:id', requireAuthentication, (request, response) => {

        const id = request.params.id;

        databaseClient.query(`delete from ${categoryOrProductInfo.tableName} where id = ${id}`)
            .then(({ rowCount }) => {
                if (rowCount === 0) {
                    sendIdDoesNotExistFailure(request, response);
                } else {
                    response.json(SuccessResponse(null));
                }
            }).catch(promiseCatchCallback(response));
    });

    return router;
}
