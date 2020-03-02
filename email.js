

const nodemailer = require('nodemailer');
const { Router } = require('express');
const { HTTPErrorCodes, SuccessResponse, FailureResponse, sendErrorResponseToClient } = require('./helpers.js');

const emailTransporter = nodemailer.createTransport({
    service: 'hotmail',
    auth: {
        user: 'screwsworldwebsite@hotmail.com',
        pass: process.env.EMAIL_PASSWORD,
    }
});

module.exports.getEmailRouter = function () {
    const emailRouter = Router();

    emailRouter.post('/', (request, response) => {

        const contact_email = request.body.contact_email;
        const name = request.body.name;
        const subject = request.body.subject;
        const description = request.body.description;

        const allFields = [
            ['contact_email', contact_email],
            ['name', name],
            ['subject', subject],
            ['description', description],
        ]

        const emptyFields = allFields.filter(x => {
            const value = x[1];
            return typeof value !== 'string' || value.trim() === ''
        });

        if (emptyFields.length > 0) {
            const emptyFieldsString = emptyFields.map(x => x[0]).join(', ');
            const code = HTTPErrorCodes.badRequest;
            const json = FailureResponse(`The values submitted for the following fields: ${emptyFieldsString}, are either missing or invalid.`)
            response.status(code).json(json);
            return;
        }

        const mailOptions = {
            from: 'screwsworldwebsite@hotmail.com',
            to: 'info@screwsworldbahamas.com',
            subject: `Website Query: ${subject}`,
            html: `
            <b>
                This email was sent from the Screws World website.
                <br><br>
                The sender's name is ${name}.
                <br><br>
                If you wish to reply to this person, you can contact them at <a href="mailto:${contact_email}?subject=RE: ${subject}&body=You are getting this email because you submitted a contact form on screwsworldbahamas.com.">${contact_email}</a>.
                <br><br>
                Here's what the person said:
            </b>
            <p>${description}</p>
        `,
        }

        emailTransporter.sendMail(mailOptions, (error, info) => {
            if (error != null) {
                sendErrorResponseToClient(response, error);
                return;
            } else {
                response.json(SuccessResponse(null));
            }
        });
    });

    return emailRouter;

}







