import { graphql } from 'graphql';
import { schema } from './schema';
import { rootValue } from './resolvers';

interface GraphqlEvent {
  query: string;
  variables?: Record<string, unknown>;
}

export const handler = async (event: GraphqlEvent) => {
  const result = await graphql({
    schema,
    source: event.query,
    rootValue,
    variableValues: event.variables,
  });

  if (result.errors) {
    for (const err of result.errors) {
      console.error(err);
    }
  }

  return result;
};
