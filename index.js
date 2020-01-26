
const express = require('express');
const { Client } = require('pg');


const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: true,
});

client.connect()


function SuccessResponse(data) {
    return {
        status: 'success',
        data: data,
    }
}

function FailureResponse(errorMessage) {
    return {
        status: 'failure',
        errorMessage: errorMessage,
    }
}


const app = express();

app.use(express.json());

const categoriesRouter = express.Router();

const serverErrorCode = 500;
const badRequestCode = 400;

categoriesRouter.get('/', (_, response) => {
    client.query('select * from product_category')
        .then(({rows}) => {
            response.json(SuccessResponse(rows))
        }).catch((error) => {
            response.status(serverErrorCode).json(FailureResponse(error.message));
        });
});

categoriesRouter.get('/:id', (request, response) => {
    const id = Number(request.params.id);
    if (isNaN(id) === true) {
        response.status(badRequestCode).json(FailureResponse(`the id of '${request.params.id}' is invalid`));
        return;
    }
    client.query(`select * from product_category where id = ${id}`)
        .then(({ rows }) => {
            const obj = rows[0];
            if (obj) {
                response.json(SuccessResponse(obj));
            } else {
                response.status(badRequestCode).json(FailureResponse(`could not find a category with an id of ${id}`));
            }
        }).catch((error) => {
            response.status(serverErrorCode).json(FailureResponse(error.message));
        });
});

categoriesRouter.post('/create', (request, response) => {
    const props = request.body;

    if (props.title == undefined) {
        response.status(badRequestCode).json(FailureResponse("The 'title' property is required, but you have not included it in the body."));
        return;
    }
    const propsToUse = [
        { key: "title", value: props.title },
        { key: "description", value: props.description },
        { key: "parent_category", vaue: props.parent_category },
    ].filter(x => x.value != undefined);

    const propNamesString = `(${propsToUse.map(x => x.key).join(", ")})`;
    const valuesString = `(${propsToUse.map((_, i) => "$" + (i + 1)).join(", ")})`;
    const values = propsToUse.map(x => x.value);

    client.query(`insert into product_category ${propNamesString} values ${valuesString} returning *`, values)
        .then(({rows}) => {
            response.json(SuccessResponse(rows[0]));
        }).catch((error) => {
            response.status(serverErrorCode).json(FailureResponse(error.message));
        });
});

app.use('/categories', categoriesRouter);

const port = process.env.PORT || 5000;

app.listen(port, () => console.log(`Server started on port ${port}`));


