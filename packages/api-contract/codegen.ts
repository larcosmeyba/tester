import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  schema: [
    './schema.graphql',
    './meals.graphql',
    './meal-profile.graphql',
    './meal-actions.graphql',
    './meal-prep.graphql',
    './benefits.graphql',
  ],
  documents: './operations/**/*.graphql',
  generates: {
    './src/generated/graphql.ts': {
      plugins: ['typescript', 'typescript-operations'],
      config: {
        avoidOptionals: false,
        enumsAsTypes: true,
      },
    },
  },
};

export default config;
