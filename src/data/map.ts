import type { MapNode } from '../types';

export const stackMap: MapNode = {
  kind: 'group',
  id: 'web-development-stack',
  label: 'Web開発周辺スタック',
  description: '分類から具体的な技術へ、役割の違いをたどるための全体地図',
  children: [
    {
      kind: 'group',
      id: 'languages',
      label: '言語',
      children: [
        { kind: 'category', categoryId: 'markup-language', children: [{ kind: 'stack', stackId: 'html' }] },
        { kind: 'category', categoryId: 'stylesheet-language', children: [{ kind: 'stack', stackId: 'css' }] },
        {
          kind: 'category',
          categoryId: 'programming-language',
          children: [
            { kind: 'stack', stackId: 'javascript' },
            { kind: 'stack', stackId: 'typescript' },
          ],
        },
      ],
    },
    { kind: 'category', categoryId: 'runtime', children: [{ kind: 'stack', stackId: 'nodejs' }] },
    {
      kind: 'category',
      categoryId: 'package-manager',
      children: [
        { kind: 'stack', stackId: 'npm' },
        { kind: 'stack', stackId: 'pnpm' },
      ],
    },
    {
      kind: 'category',
      categoryId: 'framework',
      children: [
        { kind: 'category', categoryId: 'fullstack-web-framework', children: [{ kind: 'stack', stackId: 'nextjs' }] },
        { kind: 'category', categoryId: 'web-api-framework', children: [{ kind: 'stack', stackId: 'hono' }] },
        { kind: 'category', categoryId: 'css-framework', children: [{ kind: 'stack', stackId: 'tailwindcss' }] },
        { kind: 'category', categoryId: 'auth-framework', children: [{ kind: 'stack', stackId: 'better-auth' }] },
      ],
    },
    {
      kind: 'category',
      categoryId: 'library',
      children: [
        { kind: 'category', categoryId: 'ui-library', children: [{ kind: 'stack', stackId: 'react' }] },
        {
          kind: 'category',
          categoryId: 'react-renderer',
          children: [
            { kind: 'stack', stackId: 'react-dom' },
            { kind: 'stack', stackId: 'react-three-fiber' },
          ],
        },
        { kind: 'category', categoryId: '3d-graphics-library', children: [{ kind: 'stack', stackId: 'threejs' }] },
        { kind: 'category', categoryId: 'state-management-library', children: [{ kind: 'stack', stackId: 'zustand' }] },
        { kind: 'category', categoryId: 'server-state-library', children: [{ kind: 'stack', stackId: 'tanstack-query' }] },
        { kind: 'category', categoryId: 'schema-validation-library', children: [{ kind: 'stack', stackId: 'zod' }] },
        {
          kind: 'category',
          categoryId: 'orm',
          children: [
            { kind: 'stack', stackId: 'drizzle-orm' },
            { kind: 'stack', stackId: 'prisma' },
          ],
        },
        { kind: 'category', categoryId: 'auth-library', children: [{ kind: 'stack', stackId: 'authjs' }] },
      ],
    },
    { kind: 'category', categoryId: 'ui-component-system', children: [{ kind: 'stack', stackId: 'shadcn-ui' }] },
    { kind: 'category', categoryId: 'build-tool', children: [{ kind: 'stack', stackId: 'vite' }] },
    {
      kind: 'category',
      categoryId: 'database',
      children: [
        {
          kind: 'category',
          categoryId: 'relational-database',
          children: [
            { kind: 'stack', stackId: 'postgresql' },
            { kind: 'stack', stackId: 'mysql' },
            { kind: 'stack', stackId: 'sqlite' },
            { kind: 'stack', stackId: 'cloudflare-d1' },
          ],
        },
        { kind: 'category', categoryId: 'document-database', children: [{ kind: 'stack', stackId: 'mongodb' }] },
        {
          kind: 'category',
          categoryId: 'object-database',
          children: [
            { kind: 'stack', stackId: 'objectdb' },
            { kind: 'stack', stackId: 'objectbox' },
          ],
        },
      ],
    },
    {
      kind: 'category',
      categoryId: 'storage',
      children: [
        {
          kind: 'category',
          categoryId: 'object-storage',
          children: [
            { kind: 'stack', stackId: 'amazon-s3' },
            { kind: 'stack', stackId: 'cloudflare-r2' },
            { kind: 'stack', stackId: 'backblaze-b2' },
            { kind: 'stack', stackId: 'google-cloud-storage' },
            { kind: 'stack', stackId: 'firebase-storage' },
          ],
        },
      ],
    },
    { kind: 'category', categoryId: 'auth-service', children: [{ kind: 'stack', stackId: 'firebase-authentication' }] },
    {
      kind: 'category',
      categoryId: 'testing',
      children: [
        { kind: 'category', categoryId: 'test-framework', children: [{ kind: 'stack', stackId: 'vitest' }] },
        { kind: 'category', categoryId: 'e2e-test-framework', children: [{ kind: 'stack', stackId: 'playwright-test' }] },
      ],
    },
    {
      kind: 'category',
      categoryId: 'code-quality',
      children: [
        { kind: 'category', categoryId: 'linter', children: [{ kind: 'stack', stackId: 'eslint' }] },
        { kind: 'category', categoryId: 'formatter', children: [{ kind: 'stack', stackId: 'prettier' }] },
        { kind: 'category', categoryId: 'integrated-toolchain', children: [{ kind: 'stack', stackId: 'biome' }] },
      ],
    },
    { kind: 'category', categoryId: 'version-control', children: [{ kind: 'stack', stackId: 'git' }] },
    { kind: 'category', categoryId: 'development-platform', children: [{ kind: 'stack', stackId: 'github' }] },
    { kind: 'category', categoryId: 'ci-cd', children: [{ kind: 'stack', stackId: 'github-actions' }] },
    { kind: 'category', categoryId: 'container', children: [{ kind: 'stack', stackId: 'docker' }] },
    {
      kind: 'category',
      categoryId: 'deployment-platform',
      children: [
        { kind: 'category', categoryId: 'application-platform', children: [{ kind: 'stack', stackId: 'vercel' }] },
        { kind: 'category', categoryId: 'serverless-runtime', children: [{ kind: 'stack', stackId: 'cloudflare-workers' }] },
        { kind: 'category', categoryId: 'web-hosting', children: [{ kind: 'stack', stackId: 'cloudflare-pages' }] },
      ],
    },
  ],
};
