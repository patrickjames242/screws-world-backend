
const express = require('express');
const path = require('path');
const app = express();

app.use(express.json())

const usersRouter = express.Router();

usersRouter.get('/', (request, response) => {
    response.send("you want to retreive all users");
});

usersRouter.get('/:id', (request, response) => {
    const id = request.params.id;
    response.send("you want to retrieve a user with the id of " + id);
});

usersRouter.post ('/create', (request, response) => {
    response.send(request.body);
});

app.use('/product-items', usersRouter);

const port = process.env.PORT || 5000;
console.log(process.env);
app.listen(port, () => console.log(`Server started on port ${port}`));


