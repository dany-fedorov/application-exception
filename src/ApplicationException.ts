import * as hbs from 'handlebars';
import type {
  PojoConstructorPropMethodResult,
  PojoConstructorSyncProps,
  PojoConstructorSyncProxy,
} from 'pojo-constructor';
import {
  constructPojoFromInstanceSync,
  constructPojoSync,
  PojoConstructorAdapters,
  PojoConstructorSyncHelpersHost,
} from 'pojo-constructor';
import { makeCaughtObjectReportJson } from 'caught-object-report-json';
import { customAlphabet } from 'nanoid';

// type Prettify<T> = {
//   [K in keyof T]: T[K];
//   // eslint-disable-next-line @typescript-eslint/ban-types
// } & {};

const replacerFunc = (config?: JsonStringifySafeConfig) => {
  const visited = new WeakSet();
  return (key: unknown, value: unknown) => {
    if (typeof value === 'object' && value !== null) {
      if (visited.has(value)) {
        config?.onCyclicReference(key, value);
        return;
      }
      visited.add(value);
    }
    return value;
  };
};

interface JsonStringifySafeConfig {
  onCyclicReference: (key: unknown, value: unknown) => void;
}

const appEx_jsonStringifySafe = (
  obj: unknown,
  indent?: string | number,
  config?: JsonStringifySafeConfig,
): string => {
  return JSON.stringify(obj, replacerFunc(config), indent);
};

interface JsonHelperArgsParsed {
  options: any;
  indent: number;
  value: unknown;
}

function parseJsonHelperArgs(args: unknown[]): JsonHelperArgsParsed {
  const [value, maybeIndent] = args;
  const options = args[args.length - 1];
  return {
    value,
    indent: typeof maybeIndent === 'number' ? maybeIndent : 0,
    options,
  };
}

function mkProblemMessage(s: string): string {
  return `${ApplicationException.name} problem: ${s}`;
}

function mkHbsDefaultHelpers() {
  return {
    'pad-end': function hbs_helper_pad(...args: unknown[]): string {
      // TODO: make safer
      try {
        if (args.length === 3) {
          return (args[1] as string).padEnd(args[0] as number);
        } else if (args.length === 4) {
          return (args[2] as string).padEnd(
            args[0] as number,
            args[1] as string,
          );
        } else {
          return '';
        }
      } catch (caught: unknown) {
        console.warn((caught as any)?.stack || caught);
        return '';
      }
    },
    'pad-start': function hbs_helper_pad(...args: unknown[]): string {
      // TODO: make safer
      try {
        if (args.length === 3) {
          return (args[1] as string).padStart(args[0] as number);
        } else if (args.length === 4) {
          return (args[2] as string).padStart(
            args[0] as number,
            args[1] as string,
          );
        } else {
          return '';
        }
      } catch (caught: unknown) {
        console.warn((caught as any)?.stack || caught);
        return '';
      }
    },
    json: function hbs_helper_json(...args: unknown[]): string {
      try {
        const { value, indent, options } = parseJsonHelperArgs(args);
        return appEx_jsonStringifySafe(value, indent, {
          onCyclicReference: (key) => {
            try {
              const message = mkProblemMessage(
                [
                  `Handlebars tried to stringify a cyclic object`,
                  `- cyclic reference on key: ${key}`,
                  `- template location: ${options?.loc?.start?.line}:${options?.loc?.start?.column} - ${options?.loc?.end?.line}:${options?.loc?.end?.column}`,
                ].join('\n'),
              );
              console.warn(message);
            } catch (caught: unknown) {
              console.warn((caught as any)?.stack || caught);
            }
          },
        });
      } catch (caught: unknown) {
        console.warn((caught as any)?.stack || caught);
        return '';
      }
    },
  };
}

export type AppExOwnProps = {
  /**
   * Unique id of this exception. Unless id is provided, it is set automatically for each instance.
   * Prefix is configured with {@link AppExOptions.idPrefix}
   */
  idBody: string;
  /**
   * A time at which exception was created.
   */
  timestamp: Date;
  /**
   * A user-friendly message suitable to display in a modal window or as a stderr of a CLI tool.
   */
  displayMessage?: string;
  /**
   * An error code.
   */
  code?: string;
  /**
   * A numeric error code. Intended use cases are
   * - HTTP response status
   * - CLI exit code
   */
  numCode?: number;
  /**
   * An object with properties related to the exception.
   */
  details?: Record<string, unknown>;
  /**
   * A list of errors that caused this one.
   */
  causes?: unknown[];
  /**
   * Indicate that this instance is a mere wrapper.
   */
  isWrapper?: boolean;
};

const TIMESTAMP_FORMAT_IN_JSON_VALUES = ['iso', 'milliseconds'] as const;
export type TimestampFormatInJson =
  typeof TIMESTAMP_FORMAT_IN_JSON_VALUES[number];

export type AppExOptions = {
  applySuperDefaults: boolean;
  useClassNameAsCode: boolean;
  useMessageAsDisplayMessage: boolean;
  timestampFormatInJson: TimestampFormatInJson;
  mergeDetails: (
    d0: Record<string, unknown>,
    d1: Record<string, unknown>,
  ) => Record<string, unknown>;
  handlebarsHelpers: Record<string, (...args: any[]) => string>;
  idPrefix: string;
};

export type AppExIcfg = AppExOwnProps &
  AppExOptions & {
    message: string;
  };

export type AppExCompiledProps = {
  compiledMessage?: string;
  compiledDisplayMessage?: string;
};

/**
 * http://www.crockford.com/base32.html
 */
const makeApplicationExceptionId = customAlphabet(
  '0123456789ABCDEFGHJKMNPQRSTVWXYZ',
  26,
);

function hasProp<O extends object, K extends keyof O, V extends Required<O>[K]>(
  obj: O,
  prop: K,
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
): obj is { [k in K]: V } {
  return prop in obj;
}

type AppExIcfgDefaultsPojoConstructorInput = Omit<
  AppExIcfgPojoConstructorInput,
  'defaultsProps'
>;

export type ApplicationExceptionDefaultsProps = PojoConstructorSyncProps<
  Partial<AppExIcfg>,
  AppExIcfgDefaultsPojoConstructorInput
>;

type AppExIcfgPojoConstructorInput = {
  icfgInput: Partial<AppExIcfg>;
  now: Date;
  defaultsProps?: ApplicationExceptionDefaultsProps;
  superDefaultsPropsArray?: ApplicationExceptionDefaultsProps[];
  class: { new (icfg: AppExIcfg): ApplicationException; name: string };
};

class AppExIcfgDefaultsPojoConstructor
  implements PojoConstructorSyncProps<AppExIcfg, AppExIcfgPojoConstructorInput>
{
  message() {
    return { value: 'Something went wrong' };
  }

  timestamp({ now }: AppExIcfgDefaultsPojoConstructorInput) {
    return { value: new Date(now) };
  }

  idBody() {
    return {
      value: makeApplicationExceptionId(),
    };
  }

  useClassNameAsCode() {
    return { value: false };
  }

  useMessageAsDisplayMessage() {
    return { value: false };
  }

  applySuperDefaults() {
    return { value: true };
  }

  timestampFormatInJson() {
    return { value: 'iso' as TimestampFormatInJson };
  }

  mergeDetails() {
    return {
      value: (
        d0: Record<string, unknown>,
        d1: Record<string, unknown>,
      ): Record<string, unknown> => {
        return {
          ...d0,
          ...d1,
        };
      },
    };
  }

  handlebarsHelpers() {
    return {
      value: mkHbsDefaultHelpers(),
    };
  }

  idPrefix() {
    return {
      value: 'AE_',
    };
  }
}

const PRIVATE = Symbol('PRIVATE_SYM');

class AppExIcfgPojoConstructorPrivateProps {
  superDefaultsArray: Partial<AppExIcfg>[] | null = null;
  inputDefaults: Partial<AppExIcfg> | null = null;
  defaultDefaults: AppExIcfg | null = null;

  getSuperDefaultsArray(
    resolved: PojoConstructorSyncProxy<
      AppExIcfg,
      AppExIcfgDefaultsPojoConstructorInput
    >,
    input: AppExIcfgPojoConstructorInput,
  ): Partial<AppExIcfg>[] | null {
    if (
      resolved.applySuperDefaults().value === true &&
      this.superDefaultsArray === null &&
      Array.isArray(input.superDefaultsPropsArray) &&
      input.superDefaultsPropsArray.length > 0
    ) {
      this.superDefaultsArray = input.superDefaultsPropsArray.map((d) => {
        const r = constructPojoFromInstanceSync(d, input);
        return r.value;
      });
    }
    return this.superDefaultsArray;
  }

  getInputDefaults(
    input: AppExIcfgPojoConstructorInput,
  ): Partial<AppExIcfg> | null {
    if (this.inputDefaults === null && input.defaultsProps) {
      const r = constructPojoFromInstanceSync(input.defaultsProps, input);
      this.inputDefaults = r.value;
    }
    return this.inputDefaults;
  }

  getDefaultDefaults(input: AppExIcfgPojoConstructorInput): AppExIcfg {
    if (this.defaultDefaults === null) {
      const r = constructPojoSync(AppExIcfgDefaultsPojoConstructor, input);
      this.defaultDefaults = r.value;
    }
    return this.defaultDefaults;
  }

  resolveAppExIcfgProp<K extends keyof AppExIcfg>(
    resolved: PojoConstructorSyncProxy<
      AppExIcfg,
      AppExIcfgDefaultsPojoConstructorInput
    >,
    input: AppExIcfgPojoConstructorInput,
    resolvePropInput: Omit<
      ResolveAppExIcfgPropInput<K>,
      'inputDefaults' | 'defaultDefaults' | 'superDefaultsArray' | 'icfgInput'
    >,
  ): PojoConstructorPropMethodResult<AppExIcfg[K]> {
    return resolveAppExIcfgProp({
      ...resolvePropInput,
      icfgInput: input.icfgInput,
      inputDefaults: this.getInputDefaults(input),
      superDefaultsArray:
        resolvePropInput.propName === 'applySuperDefaults'
          ? null
          : this.getSuperDefaultsArray(resolved, input),
      defaultDefaults: this.getDefaultDefaults(input),
    });
  }
}

type ResolveAppExIcfgPropInput<K extends keyof AppExIcfg> = {
  propName: K;
  isValid: (value: AppExIcfg[K]) => boolean;
  icfgInput: Partial<AppExIcfg>;
  inputDefaults: Partial<AppExIcfg> | null;
  superDefaultsArray: Partial<AppExIcfg>[] | null;
  defaultDefaults: AppExIcfg;
};

function resolveAppExIcfgProp<K extends keyof AppExIcfg>(
  input: ResolveAppExIcfgPropInput<K>,
): PojoConstructorPropMethodResult<AppExIcfg[K]> {
  const {
    propName,
    isValid,
    icfgInput,
    inputDefaults,
    superDefaultsArray,
    defaultDefaults,
  } = input;
  const hasThisProp = (obj: Partial<AppExIcfg>): boolean =>
    hasProp(obj, propName) && isValid(obj[propName]);
  if (hasThisProp(icfgInput)) {
    return { value: icfgInput[propName] as AppExIcfg[K] };
  }
  if (inputDefaults !== null && hasThisProp(inputDefaults)) {
    return { value: inputDefaults[propName] as AppExIcfg[K] };
  }
  if (Array.isArray(superDefaultsArray) && superDefaultsArray.length > 0) {
    for (const superDefaultsProp of superDefaultsArray) {
      if (hasThisProp(superDefaultsProp)) {
        return { value: superDefaultsProp[propName] as AppExIcfg[K] };
      }
    }
  }
  if (hasThisProp(defaultDefaults)) {
    return { value: defaultDefaults[propName] };
  }
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  return {};
}

type AppExSubclassMethodsConfiguration<StaticMethods, InstanceMethods> =
  | {
      static: StaticMethods;
      instance: InstanceMethods;
    }
  | {
      static: StaticMethods;
      instance?: never;
    }
  | {
      static?: never;
      instance: InstanceMethods;
    };

class AppExIcfgPojoConstructor
  implements PojoConstructorSyncProps<AppExIcfg, AppExIcfgPojoConstructorInput>
{
  [PRIVATE] = new AppExIcfgPojoConstructorPrivateProps();

  idBody(
    input: AppExIcfgPojoConstructorInput,
    helpers: PojoConstructorSyncHelpersHost<
      AppExIcfg,
      AppExIcfgPojoConstructorInput
    >,
  ) {
    return this[PRIVATE].resolveAppExIcfgProp(helpers.cache, input, {
      propName: 'idBody',
      isValid: (v) => typeof v === 'string',
    });
  }

  timestamp(
    input: AppExIcfgPojoConstructorInput,
    helpers: PojoConstructorSyncHelpersHost<
      AppExIcfg,
      AppExIcfgPojoConstructorInput
    >,
  ) {
    return this[PRIVATE].resolveAppExIcfgProp(helpers.cache, input, {
      propName: 'timestamp',
      isValid: (v) => v instanceof Date,
    });
  }

  displayMessage(
    input: AppExIcfgPojoConstructorInput,
    helpers: PojoConstructorSyncHelpersHost<
      AppExIcfg,
      AppExIcfgPojoConstructorInput
    >,
  ) {
    return this[PRIVATE].resolveAppExIcfgProp(helpers.cache, input, {
      propName: 'displayMessage',
      isValid: (v) => typeof v === 'string',
    });
  }

  code(
    input: AppExIcfgPojoConstructorInput,
    helpers: PojoConstructorSyncHelpersHost<
      AppExIcfg,
      AppExIcfgPojoConstructorInput
    >,
  ) {
    return this[PRIVATE].resolveAppExIcfgProp(helpers.cache, input, {
      propName: 'code',
      isValid: (v) => typeof v === 'string',
    });
  }

  numCode(
    input: AppExIcfgPojoConstructorInput,
    helpers: PojoConstructorSyncHelpersHost<
      AppExIcfg,
      AppExIcfgPojoConstructorInput
    >,
  ) {
    return this[PRIVATE].resolveAppExIcfgProp(helpers.cache, input, {
      propName: 'numCode',
      isValid: (v) => typeof v === 'number',
    });
  }

  mergeDetails(
    input: AppExIcfgPojoConstructorInput,
    helpers: PojoConstructorSyncHelpersHost<
      AppExIcfg,
      AppExIcfgPojoConstructorInput
    >,
  ) {
    return this[PRIVATE].resolveAppExIcfgProp(helpers.cache, input, {
      propName: 'mergeDetails',
      isValid: (v) => typeof v === 'function',
    });
  }

  handlebarsHelpers(
    input: AppExIcfgPojoConstructorInput,
    helpers: PojoConstructorSyncHelpersHost<
      AppExIcfg,
      AppExIcfgPojoConstructorInput
    >,
  ) {
    const { icfgInput } = input;
    const inputDefaults = this[PRIVATE].getInputDefaults(input);
    const defaultDefaults = this[PRIVATE].getDefaultDefaults(input);
    const superDefaultsArray = this[PRIVATE].getSuperDefaultsArray(
      helpers.cache,
      input,
    );
    const hasThisProp = (obj: Partial<AppExIcfg>): boolean =>
      hasProp(obj, 'handlebarsHelpers') &&
      typeof obj['handlebarsHelpers'] === 'object' &&
      obj['handlebarsHelpers'] !== null &&
      !Array.isArray(obj);
    const hasInIcfgInput = hasThisProp(icfgInput);
    const hasInInputDefaults =
      inputDefaults !== null && hasThisProp(inputDefaults);
    const useSuperDefaultsArray =
      Array.isArray(superDefaultsArray) && superDefaultsArray.length > 0;
    const defaultDefaultsVal = defaultDefaults['handlebarsHelpers'] as Record<
      string,
      (...args: any[]) => string
    >;
    if (hasInIcfgInput || hasInInputDefaults || useSuperDefaultsArray) {
      const inputDefaultsVal = !hasInInputDefaults
        ? {}
        : (inputDefaults['handlebarsHelpers'] as Record<string, unknown>);
      const superDefaultsVal = {};
      if (useSuperDefaultsArray) {
        for (let i = 0; i < (superDefaultsArray as any[]).length; i++) {
          const thisSuper = (superDefaultsArray as any[])[
            (superDefaultsArray as any[]).length - 1 - i
          ];
          if (hasThisProp(thisSuper)) {
            Object.assign(superDefaultsVal, thisSuper['handlebarsHelpers']);
          }
        }
      }
      const inputVal = !hasInIcfgInput
        ? {}
        : (icfgInput['handlebarsHelpers'] as Record<string, unknown>);
      return {
        value: {
          ...defaultDefaultsVal,
          ...superDefaultsVal,
          ...inputDefaultsVal,
          ...inputVal,
        },
      };
    }
    return {
      value: defaultDefaultsVal,
    };
  }

  details(
    input: AppExIcfgPojoConstructorInput,
    helpers: PojoConstructorSyncHelpersHost<
      AppExIcfg,
      AppExIcfgPojoConstructorInput
    >,
  ) {
    const { icfgInput } = input;
    const inputDefaults = this[PRIVATE].getInputDefaults(input);
    const defaultDefaults = this[PRIVATE].getDefaultDefaults(input);
    const superDefaultsArray = this[PRIVATE].getSuperDefaultsArray(
      helpers.cache,
      input,
    );
    const hasThisProp = (obj: Partial<AppExIcfg>): boolean =>
      hasProp(obj, 'details') &&
      typeof obj['details'] === 'object' &&
      obj['details'] !== null &&
      !Array.isArray(obj);
    const hasInIcfgInput = hasThisProp(icfgInput);
    const hasInDefaultDefaults = hasThisProp(defaultDefaults);
    const hasInInputDefaults =
      inputDefaults !== null && hasThisProp(inputDefaults);
    const useSuperDefaultsArray =
      Array.isArray(superDefaultsArray) && superDefaultsArray.length > 0;
    const mergeDetails = helpers.cache.mergeDetails(input).value;
    if (
      hasInIcfgInput ||
      hasInInputDefaults ||
      hasInDefaultDefaults ||
      useSuperDefaultsArray
    ) {
      const defaultDefaultsVal = !hasInDefaultDefaults
        ? {}
        : (defaultDefaults['details'] as Record<string, unknown>);
      const inputDefaultsVal = !hasInInputDefaults
        ? {}
        : (inputDefaults['details'] as Record<string, unknown>);
      const superDefaultsVal = {};
      if (useSuperDefaultsArray) {
        for (let i = 0; i < (superDefaultsArray as any[]).length; i++) {
          const thisSuper = (superDefaultsArray as any[])[
            (superDefaultsArray as any[]).length - 1 - i
          ];
          if (hasThisProp(thisSuper)) {
            Object.assign(superDefaultsVal, thisSuper['details']);
          }
        }
      }
      const inputVal = !hasInIcfgInput
        ? {}
        : (icfgInput['details'] as Record<string, unknown>);
      return {
        value: mergeDetails(
          mergeDetails(
            mergeDetails(defaultDefaultsVal, superDefaultsVal),
            inputDefaultsVal,
          ),
          inputVal,
        ),
      };
    }
    return {};
  }

  useClassNameAsCode(
    input: AppExIcfgPojoConstructorInput,
    helpers: PojoConstructorSyncHelpersHost<
      AppExIcfg,
      AppExIcfgPojoConstructorInput
    >,
  ) {
    return this[PRIVATE].resolveAppExIcfgProp(helpers.cache, input, {
      propName: 'useClassNameAsCode',
      isValid: (v) => typeof v === 'boolean',
    });
  }

  useMessageAsDisplayMessage(
    input: AppExIcfgPojoConstructorInput,
    helpers: PojoConstructorSyncHelpersHost<
      AppExIcfg,
      AppExIcfgPojoConstructorInput
    >,
  ) {
    return this[PRIVATE].resolveAppExIcfgProp(helpers.cache, input, {
      propName: 'useMessageAsDisplayMessage',
      isValid: (v) => typeof v === 'boolean',
    });
  }

  timestampFormatInJson(
    input: AppExIcfgPojoConstructorInput,
    helpers: PojoConstructorSyncHelpersHost<
      AppExIcfg,
      AppExIcfgPojoConstructorInput
    >,
  ) {
    return this[PRIVATE].resolveAppExIcfgProp(helpers.cache, input, {
      propName: 'timestampFormatInJson',
      isValid: (v) => TIMESTAMP_FORMAT_IN_JSON_VALUES.includes(v),
    });
  }

  applySuperDefaults(
    input: AppExIcfgPojoConstructorInput,
    helpers: PojoConstructorSyncHelpersHost<
      AppExIcfg,
      AppExIcfgPojoConstructorInput
    >,
  ) {
    return this[PRIVATE].resolveAppExIcfgProp(helpers.cache, input, {
      propName: 'applySuperDefaults',
      isValid: (v) => typeof v === 'boolean',
    });
  }

  idPrefix(
    input: AppExIcfgPojoConstructorInput,
    helpers: PojoConstructorSyncHelpersHost<
      AppExIcfg,
      AppExIcfgPojoConstructorInput
    >,
  ) {
    return this[PRIVATE].resolveAppExIcfgProp(helpers.cache, input, {
      propName: 'idPrefix',
      isValid: (v) => typeof v === 'string',
    });
  }

  message(
    input: AppExIcfgPojoConstructorInput,
    helpers: PojoConstructorSyncHelpersHost<
      AppExIcfg,
      AppExIcfgPojoConstructorInput
    >,
  ) {
    return this[PRIVATE].resolveAppExIcfgProp(helpers.cache, input, {
      propName: 'message',
      isValid: (v) => typeof v === 'string',
    });
  }
}

export type AppExJsonObject<P extends AppExJsonPrimitive> = {
  [x: string]: AppExJsonValue<P>;
};
export type AppExJsonArray<P extends AppExJsonPrimitive> = Array<
  AppExJsonValue<P>
>;
export type AppExJsonPrimitive = string | number | boolean | null;
export type AppExJsonValue<P extends AppExJsonPrimitive> =
  | P
  | AppExJsonObject<P>
  | AppExJsonArray<P>;

const APP_EX_JSON_VERSION_0_1 = 'appex/v0.1';

export type ApplicationExceptionJson = {
  constructor_name: string;
  compiled_message: string;
  compiled_display_message?: string;
  code?: string;
  num_code?: number;
  details?: Record<string, AppExJsonValue<AppExJsonPrimitive>>;
  stack: string;
  id: string;
  causes?: unknown[];
  timestamp: string;
  raw_message: string;
  raw_display_message: string;
  v: typeof APP_EX_JSON_VERSION_0_1;
};

export type ApplicationExceptionStatic<
  Instance extends ApplicationException = ApplicationException,
> = {
  new (icfg: AppExIcfg): Instance;

  new: (...args: Parameters<typeof ApplicationException.new>) => Instance;
  lines: (...args: Parameters<typeof ApplicationException.lines>) => Instance;
  prefixedLines: (
    ...args: Parameters<typeof ApplicationException.prefixedLines>
  ) => Instance;
  plines: (
    ...args: Parameters<typeof ApplicationException.prefixedLines>
  ) => Instance;
  wrap: (caught: unknown) => Instance;

  subclass: typeof ApplicationException.subclass;

  compileTemplate: typeof ApplicationException.compileTemplate;
  defaults: typeof ApplicationException.defaults;
  normalizeInstanceConfig: typeof ApplicationException.normalizeInstanceConfig;
  createDefaultInstance: typeof ApplicationException.createDefaultInstance;
  addStaticMethods: typeof ApplicationException.addStaticMethods;

  _subclassStaticMethods: typeof ApplicationException._subclassStaticMethods;
  _subclassInstanceMethods: typeof ApplicationException._subclassInstanceMethods;
};

type AppExTemplateCompilationContext<Details = Record<string, unknown>> = {
  [k: string]: unknown;
  self: {
    id: string;
    timestamp: Date;
    code?: string;
    numCode?: number;
    details?: Details;

    message: string;
    displayMessage?: string;

    constructor_name: string;

    _options: AppExOptions;
    _own: AppExOwnProps;
    _compiled: AppExCompiledProps;
  };
};

export class ApplicationException extends Error {
  private readonly _own: AppExOwnProps;
  private readonly _compiled: AppExCompiledProps;
  private _options: AppExOptions;

  constructor(icfg: AppExIcfg) {
    super(icfg.message);
    this._options = {
      idPrefix: icfg.idPrefix,
      useClassNameAsCode: icfg.useClassNameAsCode,
      useMessageAsDisplayMessage: icfg.useMessageAsDisplayMessage,
      timestampFormatInJson: icfg.timestampFormatInJson,
      applySuperDefaults: icfg.applySuperDefaults,
      mergeDetails: icfg.mergeDetails,
      handlebarsHelpers: icfg.handlebarsHelpers,
    };
    this._own = {
      idBody: icfg.idBody,
      timestamp: icfg.timestamp,
      ...Object.fromEntries(
        (
          ['displayMessage', 'code', 'numCode', 'details', 'causes'] as Array<
            keyof AppExIcfg
          >
        ).flatMap((propName) => {
          if (!hasProp(icfg, propName)) {
            return [];
          }
          return [[propName, icfg[propName]]];
        }),
      ),
    };
    this._compiled = {};
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * Static helpers
   */

  static defaults():
    | ApplicationExceptionDefaultsProps
    | ApplicationExceptionDefaultsProps[]
    | null {
    return null;
  }

  static normalizeInstanceConfig(icfgInput: Partial<AppExIcfg>): AppExIcfg {
    const nowDate = new Date();
    const defaultsPropsRes = this.defaults();
    const defaultsPropsArray = (
      Array.isArray(defaultsPropsRes) ? defaultsPropsRes : [defaultsPropsRes]
    ).filter(Boolean) as ApplicationExceptionDefaultsProps[];
    const prefixSuperDefaults =
      defaultsPropsArray.length <= 1
        ? []
        : defaultsPropsArray.slice(0, defaultsPropsArray.length - 1);
    const defaultsProps =
      defaultsPropsArray.length === 0
        ? null
        : defaultsPropsArray[defaultsPropsArray.length - 1];
    let proto = Object.getPrototypeOf(this);
    const superDefaultsPropsArray = [...prefixSuperDefaults];
    while (proto !== null) {
      const defsRes = proto?.defaults?.();
      const defsArray = (Array.isArray(defsRes) ? defsRes : [defsRes]).filter(
        Boolean,
      );
      if (defsArray.length > 0) {
        superDefaultsPropsArray.push(...defsArray);
      }
      proto = Object.getPrototypeOf(proto);
    }
    const r = constructPojoSync<AppExIcfg, AppExIcfgPojoConstructorInput>(
      AppExIcfgPojoConstructor,
      {
        now: nowDate,
        icfgInput,
        class: this,
        ...(!defaultsProps ? {} : { defaultsProps }),
        ...(superDefaultsPropsArray.length === 0
          ? {}
          : { superDefaultsPropsArray }),
      },
    );
    return r.value;
  }

  static createDefaultInstance<Class extends ApplicationException>(
    icfgInput: Partial<AppExIcfg>,
  ): Class {
    return new this(this.normalizeInstanceConfig(icfgInput)) as Class;
  }

  static compileTemplate(
    templateString: string,
    compilationContext: Record<string, unknown>,
    helpers: Record<string, (...args: any[]) => string>,
  ): string {
    return hbs.compile(templateString)(compilationContext, {
      helpers,
    });
  }

  /**
   * Constructor variants
   *
   * generic Class is required because https://github.com/microsoft/TypeScript/issues/5863
   */

  static new<Class extends ApplicationException = ApplicationException>(
    message?: string,
  ): Class {
    return this.createDefaultInstance<Class>(
      message === undefined ? {} : { message },
    );
  }

  static lines<Class extends ApplicationException = ApplicationException>(
    ...lines: string[]
  ): Class {
    return this.new<Class>(lines.join('\n'));
  }

  static prefixedLines<
    Class extends ApplicationException = ApplicationException,
  >(prefix: string, ...lines: string[]): Class {
    return this.lines<Class>(...lines.map((l) => `${prefix}: ${l}`));
  }

  static plines<Class extends ApplicationException = ApplicationException>(
    prefix: string,
    ...lines: string[]
  ): Class {
    return this.prefixedLines<Class>(prefix, ...lines);
  }

  static wrap<Class extends ApplicationException = ApplicationException>(
    caught: unknown,
  ): Class {
    if (caught instanceof ApplicationException) {
      return caught as Class;
    }
    return AppEx.new(
      typeof caught === 'object' ? (caught as any)?.message : undefined,
    ).setIsWrapper(true) as Class;
  }

  /**
   * Subclass helper
   */
  static subclass<
    SuperclassStaticThis extends ApplicationExceptionStatic = ApplicationExceptionStatic,
    SubclassStaticThis = any,
    SubclassInstanceThis = any,
    SubclassStaticMethods extends Record<
      string,
      (this: SubclassStaticThis, ...rest: any[]) => any
      // eslint-disable-next-line @typescript-eslint/ban-types
    > = {},
    SubclassInstanceMethods extends Record<
      string,
      (this: SubclassInstanceThis, ...rest: any[]) => any
      // eslint-disable-next-line @typescript-eslint/ban-types
    > = {},
  >(
    this: SuperclassStaticThis,
    className: string,
    defaults?: Partial<AppExIcfg>,
    methods?: AppExSubclassMethodsConfiguration<
      SubclassStaticMethods,
      SubclassInstanceMethods
    >,
  ): SuperclassStaticThis['_subclassStaticMethods'] &
    ApplicationExceptionStatic<
      ApplicationException &
        SubclassInstanceMethods &
        SuperclassStaticThis['_subclassInstanceMethods']
    > & {
      _subclassStaticMethods: SuperclassStaticThis['_subclassStaticMethods'] &
        SubclassStaticMethods;
      _subclassInstanceMethods: SuperclassStaticThis['_subclassInstanceMethods'] &
        SubclassInstanceMethods;
    } & SubclassStaticMethods {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    const Class = class extends this {
      constructor(...args: any[]) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        super(...args);
        if (methods?.instance && typeof methods?.instance === 'object') {
          Object.assign(this, methods.instance);
        }
      }
    };
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    Class._subclassStaticMethods = methods?.static;
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    Class._subclassInstanceMethods = methods?.instance;
    /**
     * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/name#telling_the_constructor_name_of_an_object
     */
    Object.defineProperty(Class, 'name', {
      value: className,
      writable: false,
      enumerable: false,
      configurable: true,
    });
    if (methods?.static && typeof methods?.static === 'object') {
      Object.assign(Class, methods.static);
    }
    if (defaults) {
      /**
       * Assigned from staticMethods
       */
      const hasOwnDefaults = Object.prototype.hasOwnProperty.call(
        Class,
        'defaults',
      );
      const defaultsStaticMethod = Class.defaults;
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      Class.defaults = function () {
        const staticMethodDefaultsRes = !hasOwnDefaults
          ? null
          : defaultsStaticMethod();
        const staticMethodDefaultsResArray = (
          !Array.isArray(staticMethodDefaultsRes)
            ? [staticMethodDefaultsRes]
            : staticMethodDefaultsRes
        ).filter(Boolean) as ApplicationExceptionDefaultsProps[];
        const plainObjectDefaultsProps = PojoConstructorAdapters.props({
          src: 'plain',
          dst: 'sync',
        })<Partial<AppExIcfg>>(defaults);
        /**
         * If you specify same options when doing .subclass both as plain-object in second arg,
         * and as a result of `defaults` static method, then static method result takes precedence
         */
        return [
          plainObjectDefaultsProps,
          ...staticMethodDefaultsResArray,
        ].filter(Boolean) as ApplicationExceptionDefaultsProps[];
      };
    }
    /**
     * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error/name
     */
    Object.defineProperty(Class.prototype, 'name', {
      value: className,
      writable: true,
      enumerable: false,
      configurable: true,
    });
    return Class as unknown as ApplicationExceptionStatic<
      ApplicationException &
        SubclassInstanceMethods &
        SuperclassStaticThis['_subclassInstanceMethods']
    > &
      SuperclassStaticThis['_subclassStaticMethods'] & {
        _subclassStaticMethods: SuperclassStaticThis['_subclassStaticMethods'] &
          SubclassStaticMethods;
        _subclassInstanceMethods: SuperclassStaticThis['_subclassInstanceMethods'] &
          SubclassInstanceMethods;
      } & SubclassStaticMethods;
  }

  /**
   * Instance helpers
   */

  getTemplateCompilationContext(): AppExTemplateCompilationContext<
    Parameters<this['setDetails']>[0]
  > {
    const code = this.getCode();
    const numCode = this.getNumCode();
    const details = this.getDetails();
    const displayMessage = this.getRawDisplayMessage();
    return {
      ...this.getDetails(),
      self: {
        id: this.getId(),
        timestamp: this.getTimestamp(),
        ...(!code ? {} : { code }),
        ...(!numCode ? {} : { numCode }),
        ...(!details ? {} : { details }),

        message: this.getRawMessage(),
        ...(!displayMessage ? {} : { displayMessage }),

        constructor_name: this.constructor.name,

        _options: this._options,
        _own: this._own,
        _compiled: this._compiled,
      },
    };
  }

  compileTemplate(
    templateString: string,
    compilationContext: Record<string, unknown>,
  ): string {
    const compileTemplateFn =
      typeof (this.constructor as any).compileTemplate === 'function'
        ? (this.constructor as any).compileTemplate
        : ApplicationException.compileTemplate;
    return compileTemplateFn(
      templateString,
      compilationContext,
      this._options.handlebarsHelpers,
    );
  }

  /**
   * Setters & getters
   */

  setIdBody(ID: string): this {
    this._own.idBody = ID;
    return this;
  }

  getIdBody(): string {
    return this._own.idBody;
  }

  getId(): string {
    return [this._options.idPrefix, this.getIdBody()].join('');
  }

  setTimestamp(ts: Date): this {
    this._own.timestamp = ts;
    return this;
  }

  getTimestamp(): Date {
    return this._own.timestamp;
  }

  getTimestampIsoString(): string {
    return this._own.timestamp.toISOString();
  }

  getTimestampMilliseconds(): string {
    return String(this._own.timestamp.getTime());
  }

  getTimestampForJson(): string {
    switch (this._options.timestampFormatInJson) {
      case 'milliseconds':
        return this.getTimestampMilliseconds();
      case 'iso':
      default:
        return this.getTimestampIsoString();
    }
  }

  setNumCode(n: number): this {
    this._own.numCode = n;
    return this;
  }

  getNumCode(): number | undefined {
    return this._own?.numCode;
  }

  setCode(c: string): this {
    this._own.code = c;
    return this;
  }

  getCode(): string | undefined {
    if (typeof this._own.code === 'string') {
      return this._own.code;
    }
    if (this._options.useClassNameAsCode === true) {
      return this.constructor.name;
    }
    return undefined;
  }

  setDisplayMessage(msg: string): this {
    this._own.displayMessage = msg;
    return this;
  }

  private getRawDisplayMessage(): string | undefined {
    if (typeof this._own.displayMessage === 'string') {
      return this._own.displayMessage;
    }
    if (this._options.useMessageAsDisplayMessage) {
      return this.message;
    }
    return undefined;
  }

  private mutCompileDisplayMessage(): void {
    if (
      typeof this._compiled.compiledDisplayMessage === 'string' ||
      this.getRawDisplayMessage() === undefined
    ) {
      return;
    }
    const compiled = this.compileTemplate(
      this.getRawDisplayMessage() as string,
      this.getTemplateCompilationContext(),
    );
    this._compiled.compiledDisplayMessage = compiled;
  }

  private getCompiledDisplayMessage(): string | undefined {
    if (typeof this._compiled?.compiledDisplayMessage === 'string') {
      return this._compiled?.compiledDisplayMessage;
    }
    if (this.getRawDisplayMessage() === undefined) {
      return undefined;
    }
    this.mutCompileDisplayMessage();
    if (this._compiled?.compiledDisplayMessage === undefined) {
      return undefined;
    }
    return this._compiled.compiledDisplayMessage;
  }

  getDisplayMessage(): string | undefined {
    return this.getCompiledDisplayMessage();
  }

  private mutCompileMessage(): void {
    if (
      typeof this._compiled?.compiledMessage === 'string' ||
      typeof this.message !== 'string'
    ) {
      return;
    }
    const compiled = this.compileTemplate(
      this.message,
      this.getTemplateCompilationContext(),
    );
    this._compiled.compiledMessage = compiled;
  }

  getCompiledMessage(): string {
    if (typeof this._compiled?.compiledMessage === 'string') {
      return this._compiled?.compiledMessage;
    }
    this.mutCompileMessage();
    if (this._compiled?.compiledMessage === undefined) {
      return this.message;
    }
    return this._compiled?.compiledMessage;
  }

  getRawMessage(): string {
    return this.message;
  }

  getMessage(): string {
    return this.getCompiledMessage();
  }

  setDetails(d: Record<string, unknown>): this {
    this._own.details = d;
    return this;
  }

  getDetails(): Parameters<this['setDetails']>[0] | undefined {
    return this._own.details;
  }

  addDetails(d: Partial<Parameters<this['setDetails']>[0]>): this {
    return this.setDetails(
      this._options.mergeDetails(this.getDetails() ?? {}, d ?? {}),
    );
  }

  getCauses() {
    return this._own.causes;
  }

  setCauses(causes: unknown[]): this {
    this._own.causes = causes;
    return this;
  }

  addCauses(...causes: unknown[]): this {
    if (!Array.isArray(this.getCauses())) {
      this.setCauses([]);
    }
    return this.setCauses([...(this.getCauses() ?? []), ...causes]);
  }

  getCausesJson() {
    const causes = this.getCauses();
    if (!Array.isArray(causes)) {
      return undefined;
    }
    return causes.map((c) =>
      makeCaughtObjectReportJson(c, {
        metadataFields: true,
        onCaughtMaking(caught) {
          console.warn(`${this.constructor.name}#getCausesJson: ${caught}`);
        },
      }),
    );
  }

  setOptions(options: AppExOptions): this {
    this._options = options;
    return this;
  }

  getOptions(): AppExOptions {
    return this._options;
  }

  addOptions(options: Partial<AppExOptions>): this {
    return this.setOptions({
      ...this.getOptions(),
      ...options,
    });
  }

  setIsWrapper(isIt: boolean): this {
    this._own.isWrapper = isIt;
    return this;
  }

  getIsWrapper(): boolean | undefined {
    return this._own.isWrapper;
  }

  /**
   * Builder methods
   */

  id(ID: string): this {
    return this.setIdBody(ID);
  }

  timestamp(ts: Date): this {
    return this.setTimestamp(ts);
  }

  numCode(n: number): this {
    return this.setNumCode(n);
  }

  code(c: string): this {
    return this.setCode(c);
  }

  displayMessage(msg: string): this {
    return this.setDisplayMessage(msg);
  }

  displayMessageLines(...lines: string[]): this {
    return this.displayMessage(lines.join('\n'));
  }

  displayMessagePrefixedLines(prefix: string, ...lines: string[]): this {
    return this.displayMessageLines(...lines.map((l) => `${prefix}: ${l}`));
  }

  displayMessagePlines(prefix: string, ...lines: string[]): this {
    return this.displayMessagePrefixedLines(prefix, ...lines);
  }

  details(d: Partial<Parameters<this['setDetails']>[0]>): this {
    return this.addDetails(d);
  }

  causedBy(...causes: unknown[]): this {
    return this.addCauses(...causes);
  }

  options(opts: Partial<AppExOptions>): this {
    return this.addOptions(opts);
  }

  /**
   * Other instance methods
   */
  toJSON(): ApplicationExceptionJson {
    return Object.fromEntries(
      [
        ['constructor_name', this.constructor.name],
        ['message', this.getMessage()],
        ['display_message', this.getDisplayMessage()],
        ['code', this.getCode()],
        ['num_code', this.getNumCode()],
        ['details', this.getDetails()],
        ['stack', this.stack],
        ['id', this.getId()],
        ['causes', this.getCausesJson()],
        ['timestamp', this.getTimestampForJson()],
        ['raw_message', this.getRawMessage()],
        ['raw_display_message', this.getRawDisplayMessage()],
        ['is_wrapper', this.getIsWrapper()],
        ['v', APP_EX_JSON_VERSION_0_1],
      ].filter(([, v]) => v !== undefined),
    );
  }

  static addStaticMethods<
    This extends ApplicationExceptionStatic,
    StaticMethods extends Record<
      string,
      (this: This, ...rest: any[]) => any
      // eslint-disable-next-line @typescript-eslint/ban-types
    > = {},
  >(this: This, methods: StaticMethods): This & StaticMethods {
    return Object.assign(this, methods);
  }

  // eslint-disable-next-line @typescript-eslint/ban-types
  static _subclassStaticMethods: {} = {};
  // eslint-disable-next-line @typescript-eslint/ban-types
  static _subclassInstanceMethods: {} = {};
}

export const AppEx = ApplicationException;
