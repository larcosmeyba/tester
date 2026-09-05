import type { GraphQLDocument, ResultOf, VariablesOf } from "./operations";

import { getGraphQLAuthToken } from "@/auth/auth-client";

export type GraphQLClientStatus = "configured";
export type GetAuthToken = () => Promise<string | null> | string | null;

type GraphQLClientOptions = {
  endpoint?: string;
  getAuthToken?: GetAuthToken;
};

type GraphQLResponse<TData> = {
  data?: TData;
  errors?: GraphQLErrorDetail[];
};

export type GraphQLErrorDetail = {
  message: string;
  extensions?: Record<string, unknown>;
};

function responseSummary(response: Response, body: string) {
  const status = `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`;
  const detail = body.replace(/\s+/g, " ").trim().slice(0, 300);
  return detail ? `${status}: ${detail}` : `${status}: Empty response from GraphQL server`;
}

const defaultEndpoint =
  process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8080/graphql";

export const graphqlClientStatus: GraphQLClientStatus = "configured";

export class GraphQLRequestError extends Error {
  readonly status: number;
  readonly graphQLErrors: GraphQLErrorDetail[];

  constructor(
    message: string,
    status: number,
    graphQLErrors: GraphQLErrorDetail[] = [],
  ) {
    super(message);
    this.name = "GraphQLRequestError";
    this.status = status;
    this.graphQLErrors = graphQLErrors;
  }
}

export function createGraphQLClient({
  endpoint = defaultEndpoint,
  getAuthToken,
}: GraphQLClientOptions = {}) {
  return {
    async request<TDocument extends GraphQLDocument<unknown, unknown>>(
      document: TDocument,
      variables?: VariablesOf<TDocument>,
    ): Promise<ResultOf<TDocument>> {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      const token = await getAuthToken?.();
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          query: document,
          variables: variables ?? undefined,
        }),
      });

      const responseBody = await response.text();
      let payload: GraphQLResponse<ResultOf<TDocument>> = {};
      try {
        payload = responseBody
          ? (JSON.parse(responseBody) as GraphQLResponse<ResultOf<TDocument>>)
          : {};
      } catch {
        // Keep the raw body so HTTP errors from proxies and infrastructure are visible.
      }

      if (!response.ok || payload.errors?.length) {
        throw new GraphQLRequestError(
          payload.errors?.map(({ message }) => message).join("; ") ||
            responseSummary(response, responseBody),
          response.status,
          payload.errors ?? [],
        );
      }
      if (!payload.data) {
        throw new GraphQLRequestError(
          "GraphQL response did not include data",
          response.status,
        );
      }
      return payload.data;
    },
  };
}

export const graphqlClient = createGraphQLClient({
  getAuthToken: getGraphQLAuthToken,
});
