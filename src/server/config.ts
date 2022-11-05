import fs from 'fs';
import * as joi from 'typesafe-joi';

const configJoi = joi.object({
	server: joi.object({
		url: joi.string().required(),
		websocketPort: joi.number().default(3001),
	}).required(),
	jira: joi.object({
		url: joi.string().required(),
		consumerKey: joi.string().required(),
		privateKey: joi.string().required(),
		storyPointsFieldName: joi.string(),
		strictSSL: joi.boolean().default(true),
	}).required(),
}).required();

const obj = JSON.parse(fs.readFileSync('config.json', 'utf8'));
const { error, value } = configJoi.validate(obj);
if (error) {
	throw new Error(`Failed to parse configuration file: ${error.message}`);
}

export default value;
