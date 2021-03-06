import { endpoint } from '@octokit/endpoint';
import { getUserAgent } from 'universal-user-agent';
import { isPlainObject } from 'is-plain-object';
import { RequestError } from '@octokit/request-error';

const VERSION = "5.4.15";

function getBufferResponse(response) {
    return response.arrayBuffer();
}

function fetchWrapper(requestOptions) {
    if (isPlainObject(requestOptions.body) ||
        Array.isArray(requestOptions.body)) {
        requestOptions.body = JSON.stringify(requestOptions.body);
    }
    let headers = {};
    let status;
    let url;
    // const fetch = (requestOptions.request && requestOptions.request.fetch) /* || nodeFetch */;
    return fetch(requestOptions.url, Object.assign({
        method: requestOptions.method,
        body: requestOptions.body,
        headers: requestOptions.headers,
        redirect: requestOptions.redirect,
    },
        // `requestOptions.request.agent` type is incompatible
        // see https://github.com/octokit/types.ts/pull/264
        requestOptions.request))
        .then((response) => {
            url = response.url;
            status = response.status;
            for (const keyAndValue of response.headers) {
                headers[keyAndValue[0]] = keyAndValue[1];
            }
            if (status === 204 || status === 205) {
                return;
            }
            // GitHub API returns 200 for HEAD requests
            if (requestOptions.method === "HEAD") {
                if (status < 400) {
                    return;
                }
                throw new RequestError(response.statusText, status, {
                    headers,
                    request: requestOptions,
                });
            }
            if (status === 304) {
                throw new RequestError("Not modified", status, {
                    headers,
                    request: requestOptions,
                });
            }
            if (status >= 400) {
                return response
                    .text()
                    .then((message) => {
                        const error = new RequestError(message, status, {
                            headers,
                            request: requestOptions,
                        });
                        try {
                            let responseBody = JSON.parse(error.message);
                            Object.assign(error, responseBody);
                            let errors = responseBody.errors;
                            // Assumption `errors` would always be in Array format
                            error.message =
                                error.message + ": " + errors.map(JSON.stringify).join(", ");
                        }
                        catch (e) {
                            // ignore, see octokit/rest.js#684
                        }
                        throw error;
                    });
            }
            const contentType = response.headers.get("content-type");
            if (/application\/json/.test(contentType)) {
                return response.json();
            }
            if (!contentType || /^text\/|charset=utf-8$/.test(contentType)) {
                return response.text();
            }
            return getBufferResponse(response);
        })
        .then((data) => {
            return {
                status,
                url,
                headers,
                data,
            };
        })
        .catch((error) => {
            if (error instanceof RequestError) {
                throw error;
            }
            throw new RequestError(error.message, 500, {
                headers,
                request: requestOptions,
            });
        });
}

function withDefaults(oldEndpoint, newDefaults) {
    const endpoint = oldEndpoint.defaults(newDefaults);
    const newApi = function (route, parameters) {
        const endpointOptions = endpoint.merge(route, parameters);
        if (!endpointOptions.request || !endpointOptions.request.hook) {
            return fetchWrapper(endpoint.parse(endpointOptions));
        }
        const request = (route, parameters) => {
            return fetchWrapper(endpoint.parse(endpoint.merge(route, parameters)));
        };
        Object.assign(request, {
            endpoint,
            defaults: withDefaults.bind(null, endpoint),
        });
        return endpointOptions.request.hook(request, endpointOptions);
    };
    return Object.assign(newApi, {
        endpoint,
        defaults: withDefaults.bind(null, endpoint),
    });
}

const request = withDefaults(endpoint, {
    headers: {
        "user-agent": `octokit-request.js/${VERSION} ${getUserAgent()}`,
    },
});

export { request };
//# sourceMappingURL=index.js.map
