import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class WarsitaApi implements ICredentialType {
	name = 'warsitaApi';

	displayName = 'Warsita API';

	icon: Icon = { light: 'file:../icons/warsita.svg', dark: 'file:../icons/warsita.dark.svg' };

	documentationUrl = 'https://warsita.com/docs/n8n';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description:
				"A session API key (wsk_…) from the session's page in the Warsita dashboard, or a personal access token (wsp_…) from Settings → Access Tokens. The Warsita Trigger needs a personal access token.",
		},
		{
			displayName: 'Session ID',
			name: 'sessionId',
			type: 'string',
			default: '',
			placeholder: 'ses_…',
			description:
				'With a personal access token: the session (WhatsApp number) to use. Leave it empty with a session API key.',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://api.warsita.com',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	// A session key can list its messages; a token can read its session (or the list of them).
	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '={{$credentials.apiKey.startsWith("wsk_") ? "/v1/messages?limit=1" : "/v1/sessions" + ($credentials.sessionId ? "/" + $credentials.sessionId : "")}}',
		},
	};
}
