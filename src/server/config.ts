import fs from 'fs';
import * as joi from 'typesafe-joi';

const configJoi = joi.object({
	server: joi.object({
		url: joi.string().required(),
		redirectUrl: joi.string().default<string>(joi.ref('url')),
		websocketPort: joi.number().default(3001),
	}).required(),
	jira: joi.object({
		url: joi.string().required(),
		clientId: joi.string().required(),
		clientSecret: joi.string().required(),
		storyPointsFieldName: joi.string(),
		strictSSL: joi.boolean().default(true),
		renderFields: joi.array().items(joi.string()).default(['description']),
	}).required(),
	api: joi.object({
		port: joi.number().required(),
		auth: joi.string(),
	}),
}).required();

const filename = (process.env.NODE_ENV === 'development') ? 'config-dev.json' : 'config.json';
const obj = JSON.parse(fs.readFileSync(filename, 'utf8'));
const { error, value } = configJoi.validate(obj);
if (error) {
	throw new Error(`Failed to parse configuration file: ${error.message}`);
}

export default value;
