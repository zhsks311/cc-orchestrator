export function assertSupportedPublishMode({ version, dryRun, bumpType }) {
  if (dryRun || bumpType) {
    return;
  }

  throw new Error(
    `Refusing to publish v${version} from the local/manual fallback without a version bump. ` +
      'Use the GitHub Actions "Publish to npm" workflow_dispatch job for the canonical release path, ' +
      `or run with --dry-run to preview v${version}.`
  );
}
