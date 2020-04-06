module.exports = {
    "env": {
        "browser": true,
        "es6": true
    },
    "parser": "@typescript-eslint/parser",
    "parserOptions": {
        "project": "tsconfig.json",
        "sourceType": "module"
    },
    "plugins": [
        "@typescript-eslint",
        "@typescript-eslint/tslint",
        "react-hooks"
    ],
    "rules": {
        "@typescript-eslint/await-thenable": "error",
        "@typescript-eslint/class-name-casing": "error",
        "@typescript-eslint/consistent-type-assertions": "error",
        "@typescript-eslint/no-floating-promises": "error",
        "@typescript-eslint/no-for-in-array": "error",
        "@typescript-eslint/no-misused-new": "error",
        "@typescript-eslint/no-this-alias": "error",
        "@typescript-eslint/prefer-for-of": "error",
        "@typescript-eslint/restrict-plus-operands": "error",
        "@typescript-eslint/semi": [
            "error",
            "always"
        ],
        "@typescript-eslint/strict-boolean-expressions": "error",
        "react-hooks/rules-of-hooks": "error",
        "react-hooks/exhaustive-deps": "warn",
        "comma-dangle": "error",
        "constructor-super": "error",
        "dot-notation": "error",
        "eqeqeq": [
            "error",
            "smart"
        ],
        "guard-for-in": "error",
        "no-bitwise": "error",
        "no-constant-condition": "error",
        "no-duplicate-imports": "error",
        "no-fallthrough": "error",
        "no-invalid-this": "error",
        "no-new-wrappers": "error",
        "no-plusplus": [
            "error",
            {
                "allowForLoopAfterthoughts": true
            }
        ],
        "no-redeclare": "error",
        "no-return-await": "error",
        "no-shadow": [
            "error",
            {
                "hoist": "all"
            }
        ],
        "no-sparse-arrays": "error",
        "no-throw-literal": "error",
        "no-trailing-spaces": "error",
        "no-unsafe-finally": "error",
        "no-unused-expressions": [
            "error",
            {
                "allowShortCircuit": true
            }
        ],
        "no-void": "error",
        "prefer-const": "error",
        "prefer-template": "error",
        "@typescript-eslint/tslint/config": [
            "error",
            {
                "rules": {
                    "match-default-export-name": true,
                    "no-boolean-literal-compare": true,
                    "no-dynamic-delete": true,
                    "no-unnecessary-callback-wrapper": true,
                    "no-unsafe-any": true,
                    "strict-type-predicates": true,
                    "whitespace": [
                        true,
                        "check-module",
                        "check-branch",
                        "check-operator",
                        "check-typecast",
                        "check-preblock",
                        "check-postblock"
                    ]
                }
            }
        ]
    }
};
