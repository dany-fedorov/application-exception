import { ulid } from 'ulid';
import * as hbs from 'handlebars';
import type {
  PojoConstructorPropMethodValue,
  PojoConstructorSync,
  PojoConstructorSyncCachingProxy,
} from 'pojo-constructor';
import {
  constructPojoFromInstanceSync,
  constructPojoSync,
} from 'pojo-constructor';
import { makeCaughtObjectReportJson } from 'caught-object-report-json';

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
  id: string;
  timestamp: Date;
  displayMessage?: string;
  code?: string;
  numCode?: number;
  details?: Record<string, unknown>;
  causes?: unknown[];
};

export type AppExOptions = {
  useClassNameAsCode: boolean;
  useMessageAsDisplayMessage: boolean;
  mergeDetails: (
    d0: Record<string, unknown>,
    d1: Record<string, unknown>,
  ) => Record<string, unknown>;
};

export type AppExIcfg = AppExOwnProps &
  AppExOptions & {
    message: string;
  };

export type AppExCompiledProps = {
  compiledMessage?: string;
  compiledDisplayMessage?: string;
};

function makeApplicationExceptionId(nowDate: Date): string {
  return ['AE', ulid(nowDate.getTime())].join('_');
}

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
  'defaults'
>;

type AppExIcfgPojoConstructorDefaultsBuilder = PojoConstructorSync<
  Partial<AppExIcfg>,
  AppExIcfgDefaultsPojoConstructorInput
>;

type AppExIcfgPojoConstructorInput = {
  icfgInput: Partial<AppExIcfg>;
  nowDate: Date;
  defaults: AppExIcfgPojoConstructorDefaultsBuilder;
};

class AppExIcfgDefaultsPojoConstructor
  implements PojoConstructorSync<AppExIcfg, AppExIcfgPojoConstructorInput>
{
  message() {
    return { value: 'Something went wrong' };
  }

  timestamp({ nowDate }: AppExIcfgDefaultsPojoConstructorInput) {
    return { value: new Date(nowDate) };
  }

  id({ nowDate }: AppExIcfgDefaultsPojoConstructorInput) {
    return { value: makeApplicationExceptionId(nowDate) };
  }

  useClassNameAsCode() {
    return { value: false };
  }

  useMessageAsDisplayMessage() {
    return { value: false };
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
}

const PRIVATE = Symbol('PRIVATE_SYM');

type AppExIcfgPojoConstructorPrivateProps = {
  inputDefaults: Partial<AppExIcfg> | null;
  defaultDefaults: AppExIcfg | null;
  getInputDefaults: (
    input: AppExIcfgPojoConstructorInput,
  ) => Partial<AppExIcfg>;
  getDefaultDefaults: (input: AppExIcfgPojoConstructorInput) => AppExIcfg;
  resolveAppExIcfgProp: <K extends keyof AppExIcfg>(
    input: AppExIcfgPojoConstructorInput,
    resolvePropInput: Omit<
      ResolveAppExIcfgPropInput<K>,
      'inputDefaults' | 'defaultDefaults' | 'icfgInput'
    >,
  ) => PojoConstructorPropMethodValue<AppExIcfg[K]>;
};

type ResolveAppExIcfgPropInput<K extends keyof AppExIcfg> = {
  propName: K;
  typeCheck: (value: AppExIcfg[K]) => boolean;
  icfgInput: Partial<AppExIcfg>;
  inputDefaults: Partial<AppExIcfg>;
  defaultDefaults: AppExIcfg;
};

function resolveAppExIcfgProp<K extends keyof AppExIcfg>(
  input: ResolveAppExIcfgPropInput<K>,
): PojoConstructorPropMethodValue<AppExIcfg[K]> {
  const { propName, typeCheck, icfgInput, inputDefaults, defaultDefaults } =
    input;
  const hasThisProp = (obj: Partial<AppExIcfg>): boolean =>
    hasProp(obj, propName) && typeCheck(obj[propName]);
  if (hasThisProp(icfgInput)) {
    return { value: icfgInput[propName] as AppExIcfg[K] };
  }
  if (hasThisProp(inputDefaults)) {
    return { value: inputDefaults[propName] as AppExIcfg[K] };
  }
  if (hasThisProp(defaultDefaults)) {
    return { value: defaultDefaults[propName] };
  }
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  return {};
}

class AppExIcfgPojoConstructor
  implements PojoConstructorSync<AppExIcfg, AppExIcfgPojoConstructorInput>
{
  [PRIVATE]: AppExIcfgPojoConstructorPrivateProps = {
    inputDefaults: null,
    defaultDefaults: null,
    getInputDefaults(input: AppExIcfgPojoConstructorInput): Partial<AppExIcfg> {
      if (this.inputDefaults === null) {
        this.inputDefaults = constructPojoFromInstanceSync(
          input.defaults,
          input,
        );
      }
      return this.inputDefaults;
    },

    getDefaultDefaults(input: AppExIcfgPojoConstructorInput): AppExIcfg {
      if (this.defaultDefaults === null) {
        this.defaultDefaults = constructPojoSync(
          AppExIcfgDefaultsPojoConstructor,
          input,
        );
      }
      return this.defaultDefaults;
    },

    resolveAppExIcfgProp<K extends keyof AppExIcfg>(
      input: AppExIcfgPojoConstructorInput,
      resolvePropInput: Omit<
        ResolveAppExIcfgPropInput<K>,
        'inputDefaults' | 'defaultDefaults' | 'icfgInput'
      >,
    ): PojoConstructorPropMethodValue<AppExIcfg[K]> {
      return resolveAppExIcfgProp({
        ...resolvePropInput,
        icfgInput: input.icfgInput,
        inputDefaults: this.getInputDefaults(input),
        defaultDefaults: this.getDefaultDefaults(input),
      });
    },
  };

  id(input: AppExIcfgPojoConstructorInput) {
    return this[PRIVATE].resolveAppExIcfgProp(input, {
      propName: 'id',
      typeCheck: (v) => typeof v === 'string',
    });
  }

  timestamp(input: AppExIcfgPojoConstructorInput) {
    return this[PRIVATE].resolveAppExIcfgProp(input, {
      propName: 'timestamp',
      typeCheck: (v) => v instanceof Date,
    });
  }

  displayMessage(input: AppExIcfgPojoConstructorInput) {
    return this[PRIVATE].resolveAppExIcfgProp(input, {
      propName: 'displayMessage',
      typeCheck: (v) => typeof v === 'string',
    });
  }

  code(input: AppExIcfgPojoConstructorInput) {
    return this[PRIVATE].resolveAppExIcfgProp(input, {
      propName: 'code',
      typeCheck: (v) => typeof v === 'string',
    });
  }

  numCode(input: AppExIcfgPojoConstructorInput) {
    return this[PRIVATE].resolveAppExIcfgProp(input, {
      propName: 'numCode',
      typeCheck: (v) => typeof v === 'number',
    });
  }

  mergeDetails(input: AppExIcfgPojoConstructorInput) {
    return this[PRIVATE].resolveAppExIcfgProp(input, {
      propName: 'mergeDetails',
      typeCheck: (v) => typeof v === 'function',
    });
  }

  details(
    input: AppExIcfgPojoConstructorInput,
    cache: PojoConstructorSyncCachingProxy<
      AppExIcfg,
      AppExIcfgPojoConstructorInput
    >,
  ) {
    const { icfgInput } = input;
    const inputDefaults = this[PRIVATE].getInputDefaults(input);
    const defaultDefaults = this[PRIVATE].getDefaultDefaults(input);
    const hasThisProp = (obj: Partial<AppExIcfg>): boolean =>
      hasProp(obj, 'details') &&
      typeof obj['details'] === 'object' &&
      obj['details'] !== null &&
      !Array.isArray(obj);
    const hasInIcfgInput = hasThisProp(icfgInput);
    const hasInInputDefaults = hasThisProp(inputDefaults);
    const hasInDefaultDefaults = hasThisProp(defaultDefaults);
    const mergeDetails = cache.mergeDetails(input).value;
    if (hasInIcfgInput || hasInInputDefaults || hasInDefaultDefaults) {
      return {
        value: mergeDetails(
          mergeDetails(
            !hasInDefaultDefaults
              ? {}
              : (defaultDefaults['details'] as Record<string, unknown>),
            !hasInInputDefaults
              ? {}
              : (inputDefaults['details'] as Record<string, unknown>),
          ),
          !hasInIcfgInput
            ? {}
            : (icfgInput['details'] as Record<string, unknown>),
        ),
        // value: {
        //   ...(!hasInDefaultDefaults ? {} : defaultDefaults['details']),
        //   ...(!hasInInputDefaults ? {} : inputDefaults['details']),
        //   ...(!hasInIcfgInput ? {} : icfgInput['details']),
        // },
      };
    }
    return {};
  }

  useClassNameAsCode(input: AppExIcfgPojoConstructorInput) {
    return this[PRIVATE].resolveAppExIcfgProp(input, {
      propName: 'useClassNameAsCode',
      typeCheck: (v) => typeof v === 'boolean',
    });
  }

  useMessageAsDisplayMessage(input: AppExIcfgPojoConstructorInput) {
    return this[PRIVATE].resolveAppExIcfgProp(input, {
      propName: 'useMessageAsDisplayMessage',
      typeCheck: (v) => typeof v === 'boolean',
    });
  }

  message(input: AppExIcfgPojoConstructorInput) {
    return this[PRIVATE].resolveAppExIcfgProp(input, {
      propName: 'message',
      typeCheck: (v) => typeof v === 'string',
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

export class ApplicationException extends Error {
  private _own: AppExOwnProps;
  private _compiled: AppExCompiledProps;
  private _options: AppExOptions;

  constructor(icfg: AppExIcfg) {
    super(icfg.message);
    this._own = {
      id: icfg.id,
      timestamp: icfg.timestamp,
      ...Object.fromEntries(
        (
          ['displayMessage', 'numCode', 'details', 'causes'] as Array<
            keyof AppExIcfg
          >
        ).flatMap((propName) => {
          if (!hasProp(icfg, propName)) {
            return [];
          }
          return [[propName, icfg[propName]]];
        }),
      ),
      ...(!hasProp(icfg, 'code')
        ? !icfg.useClassNameAsCode
          ? {}
          : { code: this.constructor.name }
        : { code: icfg.code }),
    };
    this._compiled = {};
    this._options = {
      useClassNameAsCode: icfg.useClassNameAsCode,
      useMessageAsDisplayMessage: icfg.useMessageAsDisplayMessage,
      mergeDetails: icfg.mergeDetails,
    };
  }

  /**
   * Static helpers
   */

  static normalizeInstanceConfig(icfgInput: Partial<AppExIcfg>): AppExIcfg {
    const nowDate = new Date();
    return constructPojoSync<AppExIcfg, AppExIcfgPojoConstructorInput>(
      AppExIcfgPojoConstructor,
      {
        nowDate,
        icfgInput,
        defaults: new AppExIcfgDefaultsPojoConstructor(),
      },
    );
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

  static createDefaultInstance(
    icfgInput: Partial<AppExIcfg>,
  ): ApplicationException {
    return new this(this.normalizeInstanceConfig(icfgInput));
  }

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

  static subclass(
    className: string,
    defaults: AppExIcfgPojoConstructorDefaultsBuilder,
  ): {
    new (icfg: AppExIcfg): ApplicationException;

    createDefaultInstance: typeof ApplicationException.createDefaultInstance;
    new: typeof ApplicationException.new;
    lines: typeof ApplicationException.lines;
    prefixedLines: typeof ApplicationException.prefixedLines;
    plines: typeof ApplicationException.plines;
    subclass: typeof ApplicationException.subclass;

    normalizeInstanceConfig: typeof ApplicationException.normalizeInstanceConfig;
    compileTemplate: typeof ApplicationException.compileTemplate;
  } {
    const Class = class extends this {};
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/name#telling_the_constructor_name_of_an_object
    Object.defineProperty(Class, 'name', {
      value: className,
      writable: false,
      enumerable: false,
      configurable: true,
    });
    Class.normalizeInstanceConfig = function (icfgInput: Partial<AppExIcfg>) {
      const nowDate = new Date();
      return constructPojoSync<AppExIcfg, AppExIcfgPojoConstructorInput>(
        AppExIcfgPojoConstructor,
        {
          nowDate,
          icfgInput,
          defaults,
        },
      );
    };
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error/name
    Object.defineProperty(Class.prototype, 'name', {
      value: className,
      writable: true,
      enumerable: false,
      configurable: true,
    });
    return Class;
  }

  /**
   * Instance helpers
   */

  private getCompilationContext() {
    return {
      ...this.getDetails(),
      self: {
        id: this._own.id,
        timestamp: this._own.timestamp,
        displayMessage: this._own.displayMessage,
        code: this._own.code,
        numCode: this._own.numCode,
        details: this._own.details,

        message: this.message,

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

  setId(ID: string): this {
    this._own.id = ID;
    return this;
  }

  getId(): string {
    return this._own.id;
  }

  setTimestamp(ts: Date): this {
    this._own.timestamp = ts;
    return this;
  }

  getTimestamp(): Date {
    return this._own.timestamp;
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
    return this._own.code;
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

  addDetails(d: Partial<Parameters<this['setDetails']>[0]>) {
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

  /**
   * Builder methods
   */

  id(ID: string): this {
    return this.setId(ID);
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

  details(d: Partial<Parameters<this['setDetails']>[0]>) {
    return this.addDetails(d);
  }

  causes(...cs: unknown[]): this {
    return this.addCauses(...cs);
  }

  /**
   * Other instance methods
   */
  toJSON(): ApplicationExceptionJson {
    return Object.fromEntries(
      [
        ['constructor_name', this.constructor.name],
        ['compiled_message', this.getMessage()],
        ['compiled_display_message', this.getDisplayMessage()],
        ['code', this.getCode()],
        ['num_code', this.getNumCode()],
        ['details', this.getDetails()],
        ['stack', this.stack],
        ['id', this.getId()],
        ['causes', this.getCausesJson()],
        ['timestamp', this.getTimestamp()],
        ['raw_message', this.getRawMessage()],
        ['raw_display_message', this.getRawDisplayMessage()],
        ['v', APP_EX_JSON_VERSION_0_1],
      ].filter(([, v]) => v !== undefined),
    );
  }
}

export const AppEx = ApplicationException;
