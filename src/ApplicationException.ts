import * as hbs from 'handlebars';
import type {
  PojoConstructorPropMethodValue,
  PojoConstructorPropsSync,
  PojoConstructorProxySync,
  PojoConstructorHelpersHostSync,
} from 'pojo-constructor';
import {
  constructPojoFromInstanceSync,
  constructPojoSync,
} from 'pojo-constructor';
import { makeCaughtObjectReportJson } from 'caught-object-report-json';
import { customAlphabet } from 'nanoid';

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

function mkHbsHelpers() {
  return {
    json: function hbsJsonHelper(...args: unknown[]): string {
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

export type ApplicationExceptionDefaultsProps = PojoConstructorPropsSync<
  Partial<AppExIcfg>,
  AppExIcfgDefaultsPojoConstructorInput
>;

type AppExIcfgPojoConstructorInput = {
  icfgInput: Partial<AppExIcfg>;
  now: Date;
  defaultsProps?: ApplicationExceptionDefaultsProps;
  superDefaultsProps?: ApplicationExceptionDefaultsProps;
  class: { new (icfg: AppExIcfg): ApplicationException; name: string };
};

class AppExIcfgDefaultsPojoConstructor
  implements PojoConstructorPropsSync<AppExIcfg, AppExIcfgPojoConstructorInput>
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

  idPrefix() {
    return {
      value: 'AE_',
    };
  }
}

const PRIVATE = Symbol('PRIVATE_SYM');

class AppExIcfgPojoConstructorPrivateProps {
  superDefaults: Partial<AppExIcfg> | null = null;
  inputDefaults: Partial<AppExIcfg> | null = null;
  defaultDefaults: AppExIcfg | null = null;

  getSuperDefaults(
    resolved: PojoConstructorProxySync<
      AppExIcfg,
      AppExIcfgDefaultsPojoConstructorInput
    >,
    input: AppExIcfgPojoConstructorInput,
  ): Partial<AppExIcfg> | null {
    if (
      resolved.applySuperDefaults().value === true &&
      this.superDefaults === null &&
      input.superDefaultsProps
    ) {
      this.superDefaults = constructPojoFromInstanceSync(
        input.superDefaultsProps,
        input,
      );
    }
    return this.superDefaults;
  }

  getInputDefaults(
    input: AppExIcfgPojoConstructorInput,
  ): Partial<AppExIcfg> | null {
    if (this.inputDefaults === null && input.defaultsProps) {
      this.inputDefaults = constructPojoFromInstanceSync(
        input.defaultsProps,
        input,
      );
    }
    return this.inputDefaults;
  }

  getDefaultDefaults(input: AppExIcfgPojoConstructorInput): AppExIcfg {
    if (this.defaultDefaults === null) {
      this.defaultDefaults = constructPojoSync(
        AppExIcfgDefaultsPojoConstructor,
        input,
      );
    }
    return this.defaultDefaults;
  }

  resolveAppExIcfgProp<K extends keyof AppExIcfg>(
    resolved: PojoConstructorProxySync<
      AppExIcfg,
      AppExIcfgDefaultsPojoConstructorInput
    >,
    input: AppExIcfgPojoConstructorInput,
    resolvePropInput: Omit<
      ResolveAppExIcfgPropInput<K>,
      'inputDefaults' | 'defaultDefaults' | 'superDefaults' | 'icfgInput'
    >,
  ): PojoConstructorPropMethodValue<AppExIcfg[K]> {
    return resolveAppExIcfgProp({
      ...resolvePropInput,
      icfgInput: input.icfgInput,
      inputDefaults: this.getInputDefaults(input),
      superDefaults:
        resolvePropInput.propName === 'applySuperDefaults'
          ? null
          : this.getSuperDefaults(resolved, input),
      defaultDefaults: this.getDefaultDefaults(input),
    });
  }
}

type ResolveAppExIcfgPropInput<K extends keyof AppExIcfg> = {
  propName: K;
  isValid: (value: AppExIcfg[K]) => boolean;
  icfgInput: Partial<AppExIcfg>;
  inputDefaults: Partial<AppExIcfg> | null;
  superDefaults: Partial<AppExIcfg> | null;
  defaultDefaults: AppExIcfg;
};

function resolveAppExIcfgProp<K extends keyof AppExIcfg>(
  input: ResolveAppExIcfgPropInput<K>,
): PojoConstructorPropMethodValue<AppExIcfg[K]> {
  const {
    propName,
    isValid,
    icfgInput,
    inputDefaults,
    superDefaults,
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
  if (superDefaults !== null && hasThisProp(superDefaults)) {
    return { value: superDefaults[propName] as AppExIcfg[K] };
  }
  if (hasThisProp(defaultDefaults)) {
    return { value: defaultDefaults[propName] };
  }
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  return {};
}

class AppExIcfgPojoConstructor
  implements PojoConstructorPropsSync<AppExIcfg, AppExIcfgPojoConstructorInput>
{
  [PRIVATE] = new AppExIcfgPojoConstructorPrivateProps();

  idBody(
    input: AppExIcfgPojoConstructorInput,
    helpers: PojoConstructorHelpersHostSync<
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
    helpers: PojoConstructorHelpersHostSync<
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
    helpers: PojoConstructorHelpersHostSync<
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
    helpers: PojoConstructorHelpersHostSync<
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
    helpers: PojoConstructorHelpersHostSync<
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
    helpers: PojoConstructorHelpersHostSync<
      AppExIcfg,
      AppExIcfgPojoConstructorInput
    >,
  ) {
    return this[PRIVATE].resolveAppExIcfgProp(helpers.cache, input, {
      propName: 'mergeDetails',
      isValid: (v) => typeof v === 'function',
    });
  }

  details(
    input: AppExIcfgPojoConstructorInput,
    helpers: PojoConstructorHelpersHostSync<
      AppExIcfg,
      AppExIcfgPojoConstructorInput
    >,
  ) {
    const { icfgInput } = input;
    const inputDefaults = this[PRIVATE].getInputDefaults(input);
    const defaultDefaults = this[PRIVATE].getDefaultDefaults(input);
    const superDefaults = this[PRIVATE].getSuperDefaults(helpers.cache, input);
    const hasThisProp = (obj: Partial<AppExIcfg>): boolean =>
      hasProp(obj, 'details') &&
      typeof obj['details'] === 'object' &&
      obj['details'] !== null &&
      !Array.isArray(obj);
    const hasInIcfgInput = hasThisProp(icfgInput);
    const hasInDefaultDefaults = hasThisProp(defaultDefaults);
    const hasInSuperDefaults =
      superDefaults !== null && hasThisProp(superDefaults);
    const hasInInputDefaults =
      inputDefaults !== null && hasThisProp(inputDefaults);
    const mergeDetails = helpers.cache.mergeDetails(input).value;
    if (
      hasInIcfgInput ||
      hasInInputDefaults ||
      hasInDefaultDefaults ||
      hasInSuperDefaults
    ) {
      const defaultDefaultsVal = !hasInDefaultDefaults
        ? {}
        : (defaultDefaults['details'] as Record<string, unknown>);
      const inputDefaultsVal = !hasInInputDefaults
        ? {}
        : (inputDefaults['details'] as Record<string, unknown>);
      const superDefaultsVal = !hasInSuperDefaults
        ? {}
        : (superDefaults['details'] as Record<string, unknown>);
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
    helpers: PojoConstructorHelpersHostSync<
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
    helpers: PojoConstructorHelpersHostSync<
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
    helpers: PojoConstructorHelpersHostSync<
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
    helpers: PojoConstructorHelpersHostSync<
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
    helpers: PojoConstructorHelpersHostSync<
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
    helpers: PojoConstructorHelpersHostSync<
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

export type ApplicationExceptionStatic = {
  new (icfg: AppExIcfg): ApplicationException;

  new: typeof ApplicationException.new;
  lines: typeof ApplicationException.lines;
  prefixedLines: typeof ApplicationException.prefixedLines;
  plines: typeof ApplicationException.plines;
  subclass: typeof ApplicationException.subclass;

  compileTemplate: typeof ApplicationException.compileTemplate;
  defaults: typeof ApplicationException.defaults;
  normalizeInstanceConfig: typeof ApplicationException.normalizeInstanceConfig;
  createDefaultInstance: typeof ApplicationException.createDefaultInstance;
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

  static defaults(): ApplicationExceptionDefaultsProps | null {
    return null;
  }

  static normalizeInstanceConfig(icfgInput: Partial<AppExIcfg>): AppExIcfg {
    const nowDate = new Date();
    const defaultsProps = this.defaults();
    const superDefaultsProps = Object.getPrototypeOf(this)?.defaults?.();
    return constructPojoSync<AppExIcfg, AppExIcfgPojoConstructorInput>(
      AppExIcfgPojoConstructor,
      {
        now: nowDate,
        icfgInput,
        class: this,
        ...(!defaultsProps ? {} : { defaultsProps }),
        ...(!superDefaultsProps ? {} : { superDefaultsProps }),
      },
    );
  }

  static createDefaultInstance(
    icfgInput: Partial<AppExIcfg>,
  ): ApplicationException {
    return new this(this.normalizeInstanceConfig(icfgInput));
  }

  static compileTemplate(
    templateString: string,
    compilationContext: Record<string, unknown>,
  ): string {
    return hbs.compile(templateString)(compilationContext, {
      helpers: mkHbsHelpers(),
    });
  }

  /**
   * Constructor variants
   */

  static new(message?: string): ApplicationException {
    return this.createDefaultInstance(message === undefined ? {} : { message });
  }

  static lines(...lines: string[]): ApplicationException {
    return this.new(lines.join('\n'));
  }

  static prefixedLines(
    prefix: string,
    ...lines: string[]
  ): ApplicationException {
    return this.lines(...lines.map((l) => `${prefix}: ${l}`));
  }

  static plines(prefix: string, ...lines: string[]): ApplicationException {
    return this.prefixedLines(prefix, ...lines);
  }

  /**
   * Subclass helper
   */

  static subclass<
    CreateCtor extends (...args: any[]) => ApplicationException = (
      ...args: any[]
    ) => ApplicationException,
  >(
    className: string,
    defaults: ApplicationExceptionDefaultsProps,
    createConstructor?: CreateCtor,
  ): ApplicationExceptionStatic & {
    create: CreateCtor;
  } {
    const Class = class extends this {};
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/name#telling_the_constructor_name_of_an_object
    Object.defineProperty(Class, 'name', {
      value: className,
      writable: false,
      enumerable: false,
      configurable: true,
    });
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    Class.defaults = function () {
      const parentDefaults = self.defaults();
      return { ...(parentDefaults ?? {}), ...defaults };
    };
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error/name
    Object.defineProperty(Class.prototype, 'name', {
      value: className,
      writable: true,
      enumerable: false,
      configurable: true,
    });
    if (typeof createConstructor === 'function') {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error
      Class.create = createConstructor;
    } else {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error
      Class.create = ApplicationException.new;
    }
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    return Class;
  }

  /**
   * Instance helpers
   */

  private getCompilationContext() {
    return {
      ...this.getDetails(),
      self: {
        id: this.getId(),
        timestamp: this.getTimestamp(),
        code: this.getCode(),
        numCode: this.getNumCode(),
        details: this.getDetails(),

        message: this.getRawMessage(),
        displayMessage: this.getRawDisplayMessage(),

        _options: this._options,
        _own: this._own,
        _compiled: this._compiled,
      },
    };
  }

  private compileTemplate(
    templateString: string,
    compilationContext: Record<string, unknown>,
  ): string {
    const compileTemplateFn =
      typeof (this.constructor as any).compileTemplate === 'function'
        ? (this.constructor as any).compileTemplate
        : ApplicationException.compileTemplate;
    return compileTemplateFn(templateString, compilationContext);
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
      this.getCompilationContext(),
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
      this.getCompilationContext(),
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

  causedBy(...cs: unknown[]): this {
    return this.addCauses(...cs);
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
        ['v', APP_EX_JSON_VERSION_0_1],
      ].filter(([, v]) => v !== undefined),
    );
  }
}

export const AppEx = ApplicationException;
