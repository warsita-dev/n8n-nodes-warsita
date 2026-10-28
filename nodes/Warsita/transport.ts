import {
	NodeApiError,
	NodeOperationError,
	type IDataObject,
	type IExecuteFunctions,
	type IHookFunctions,
	type IHttpRequestMethods,
	type JsonObject,
} from 'n8n-workflow';

type Context = IExecuteFunctions | IHookFunctions;

export interface WarsitaRequest {
	method: IHttpRequestMethods;
	path: string;
	body?: IDataObject;
	qs?: IDataObject;
	headers?: IDataObject;
	/** Acts for one session: with a personal access token, the credential's session_id is added. */
	scoped?: boolean;
}

/** The credential's session, required with a personal access token. */
export async function sessionOf(this: Context): Promise<string | undefined> {
	const credentials = await this.getCredentials('warsitaApi');
	if (String(credentials.apiKey).startsWith('wsk_')) return undefined;
	const sessionId = String(credentials.sessionId ?? '').trim();
	if (!sessionId) {
		throw new NodeOperationError(
			this.getNode(),
			'Set the Session ID in the Warsita credential when you use a personal access token.',
		);
	}
	return sessionId;
}

/** Calls the Warsita API; an answer that holds only `data` is unwrapped. */
export async function warsitaRequest(this: Context, req: WarsitaRequest): Promise<unknown> {
	const credentials = await this.getCredentials('warsitaApi');
	const baseUrl = String(credentials.baseUrl || 'https://api.warsita.com').replace(/\/+$/, '');
	let body = req.body;
	let qs = req.qs ?? {};
	if (req.scoped) {
		const sessionId = await sessionOf.call(this);
		if (sessionId && req.method === 'POST') body = { ...(body ?? {}), session_id: sessionId };
		else if (sessionId) qs = { ...qs, session_id: sessionId };
	}
	try {
		const res = (await this.helpers.httpRequestWithAuthentication.call(this, 'warsitaApi', {
			method: req.method,
			url: baseUrl + req.path,
			qs,
			body,
			headers: req.headers,
			json: true,
		})) as unknown;
		if (res && typeof res === 'object' && !Array.isArray(res)) {
			const keys = Object.keys(res);
			if (keys.length === 1 && keys[0] === 'data') return (res as { data: unknown }).data;
		}
		return res;
	} catch (error) {
		throw new NodeApiError(this.getNode(), error as JsonObject);
	}
}

/** A path parameter, escaped. */
export function p(value: string): string {
	return encodeURIComponent(value.trim());
}
