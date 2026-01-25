// Type declarations for @eslint/js
declare module '@eslint/js' {
    import type { Linter } from 'eslint';

    const js: {
        configs: {
            recommended: Linter.Config;
            all: Linter.Config;
        };
    };

    export default js;
}
