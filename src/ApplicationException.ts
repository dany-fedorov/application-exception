import { ulid } from 'ulid';
import * as hbs from 'handlebars';
import type {
  PojoConstructorPropMethodValue,
  PojoConstructorSync,
} from 'pojo-constructor';
import { constructPojoSync } from 'pojo-constructor';

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

export const jsonStringifySafe = (
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
        return jsonStringifySafe(value, indent, {
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
};

export type AppExOptions = {
  useClassNameAsCode: boolean;
  useMessageAsDisplayMessage: boolean;
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
  'Defaults'
>;

type AppExIcfgPojoConstructorDefaultsBuilder = {
  new (input?: AppExIcfgDefaultsPojoConstructorInput): PojoConstructorSync<
    Partial<AppExIcfg>,
    AppExIcfgDefaultsPojoConstructorInput
  >;
};

type AppExIcfgPojoConstructorInput = {
  icfgInput: Partial<AppExIcfg>;
  nowDate: Date;
  Defaults: AppExIcfgPojoConstructorDefaultsBuilder;
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
}

const PRIVATE_PROPS = Symbol('PRIVATE_PROPS');

type AppExIcfgPojoConstructorPrivateProps = {
  inputDefaults: Partial<AppExIcfg> | null;
  defaultDefaults: AppExIcfg | null;
  getInputDefaults: (
    input: AppExIcfgPojoConstructorInput,
  ) => Partial<AppExIcfg>;
  getDefaultDefaults: (input: AppExIcfgPojoConstructorInput) => AppExIcfg;
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
  [PRIVATE_PROPS]: AppExIcfgPojoConstructorPrivateProps = {
    inputDefaults: null,
    defaultDefaults: null,
    getInputDefaults(input: AppExIcfgPojoConstructorInput): Partial<AppExIcfg> {
      if (this.inputDefaults === null) {
        this.inputDefaults = constructPojoSync(input.Defaults, input);
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
  };

  id(input: AppExIcfgPojoConstructorInput) {
    return resolveAppExIcfgProp({
      propName: 'id',
      typeCheck: (v) => typeof v === 'string',
      icfgInput: input.icfgInput,
      inputDefaults: this[PRIVATE_PROPS].getInputDefaults(input),
      defaultDefaults: this[PRIVATE_PROPS].getDefaultDefaults(input),
    });
  }

  timestamp(input: AppExIcfgPojoConstructorInput) {
    return resolveAppExIcfgProp({
      propName: 'timestamp',
      typeCheck: (v) => v instanceof Date,
      icfgInput: input.icfgInput,
      inputDefaults: this[PRIVATE_PROPS].getInputDefaults(input),
      defaultDefaults: this[PRIVATE_PROPS].getDefaultDefaults(input),
    });
  }

  displayMessage(input: AppExIcfgPojoConstructorInput) {
    return resolveAppExIcfgProp({
      propName: 'displayMessage',
      typeCheck: (v) => typeof v === 'string',
      icfgInput: input.icfgInput,
      inputDefaults: this[PRIVATE_PROPS].getInputDefaults(input),
      defaultDefaults: this[PRIVATE_PROPS].getDefaultDefaults(input),
    });
  }

  code(input: AppExIcfgPojoConstructorInput) {
    return resolveAppExIcfgProp({
      propName: 'code',
      typeCheck: (v) => typeof v === 'string',
      icfgInput: input.icfgInput,
      inputDefaults: this[PRIVATE_PROPS].getInputDefaults(input),
      defaultDefaults: this[PRIVATE_PROPS].getDefaultDefaults(input),
    });
  }

  numCode(input: AppExIcfgPojoConstructorInput) {
    return resolveAppExIcfgProp({
      propName: 'numCode',
      typeCheck: (v) => typeof v === 'number',
      icfgInput: input.icfgInput,
      inputDefaults: this[PRIVATE_PROPS].getInputDefaults(input),
      defaultDefaults: this[PRIVATE_PROPS].getDefaultDefaults(input),
    });
  }

  details(input: AppExIcfgPojoConstructorInput) {
    const { icfgInput } = input;
    const inputDefaults = this[PRIVATE_PROPS].getInputDefaults(input);
    const defaultDefaults = this[PRIVATE_PROPS].getDefaultDefaults(input);
    const hasThisProp = (obj: Partial<AppExIcfg>): boolean =>
      hasProp(obj, 'details') &&
      typeof obj['details'] === 'object' &&
      obj['details'] !== null;
    const hasInIcfgInput = hasThisProp(icfgInput);
    const hasInInputDefaults = hasThisProp(inputDefaults);
    const hasInDefaultDefaults = hasThisProp(defaultDefaults);
    if (hasInIcfgInput || hasInInputDefaults || hasInDefaultDefaults) {
      return {
        value: {
          ...(!hasInDefaultDefaults ? {} : defaultDefaults['details']),
          ...(!hasInInputDefaults ? {} : inputDefaults['details']),
          ...(!hasInIcfgInput ? {} : icfgInput['details']),
        },
      };
    }
    return {};
  }

  useClassNameAsCode(input: AppExIcfgPojoConstructorInput) {
    return resolveAppExIcfgProp({
      propName: 'useClassNameAsCode',
      typeCheck: (v) => typeof v === 'boolean',
      icfgInput: input.icfgInput,
      inputDefaults: this[PRIVATE_PROPS].getInputDefaults(input),
      defaultDefaults: this[PRIVATE_PROPS].getDefaultDefaults(input),
    });
  }

  useMessageAsDisplayMessage(input: AppExIcfgPojoConstructorInput) {
    return resolveAppExIcfgProp({
      propName: 'useMessageAsDisplayMessage',
      typeCheck: (v) => typeof v === 'boolean',
      icfgInput: input.icfgInput,
      inputDefaults: this[PRIVATE_PROPS].getInputDefaults(input),
      defaultDefaults: this[PRIVATE_PROPS].getDefaultDefaults(input),
    });
  }

  message(input: AppExIcfgPojoConstructorInput) {
    return resolveAppExIcfgProp({
      propName: 'message',
      typeCheck: (v) => typeof v === 'string',
      icfgInput: input.icfgInput,
      inputDefaults: this[PRIVATE_PROPS].getInputDefaults(input),
      defaultDefaults: this[PRIVATE_PROPS].getDefaultDefaults(input),
    });
  }
}

export class ApplicationException extends Error {
  private _own: AppExOwnProps;
  private _compiled: AppExCompiledProps;
  private _options: AppExOptions;

  constructor(icfg: AppExIcfg) {
    super(icfg.message);
    this._own = {
      id: icfg.id,
      timestamp: icfg.timestamp,
      ...(!hasProp(icfg, 'displayMessage')
        ? {}
        : { displayMessage: icfg.displayMessage }),
      ...(!hasProp(icfg, 'code')
        ? !icfg.useClassNameAsCode
          ? {}
          : { code: this.constructor.name }
        : { code: icfg.code }),
      ...(!hasProp(icfg, 'numCode') ? {} : { numCode: icfg.numCode }),
      ...(!hasProp(icfg, 'details') ? {} : { details: icfg.details }),
    };
    this._compiled = {};
    this._options = {
      useClassNameAsCode: icfg.useClassNameAsCode,
      useMessageAsDisplayMessage: icfg.useMessageAsDisplayMessage,
    };
  }

  /**
   * Helpers
   */

  static normalizeInstanceConfig(icfgInput: Partial<AppExIcfg>): AppExIcfg {
    const nowDate = new Date();
    return constructPojoSync<AppExIcfg, AppExIcfgPojoConstructorInput>(
      AppExIcfgPojoConstructor,
      {
        nowDate,
        icfgInput,
        Defaults: AppExIcfgDefaultsPojoConstructor,
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

  static new(message?: string): ApplicationException {
    return new this(
      this.normalizeInstanceConfig({
        ...(message === undefined ? {} : { message }),
      }),
    );
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
   * Subclass
   */

  static subclass(
    className: string,
    Defaults: AppExIcfgPojoConstructorDefaultsBuilder,
  ): {
    new (icfg: AppExIcfg): ApplicationException;
    new: typeof ApplicationException.new;
    lines: typeof ApplicationException.lines;
    plines: typeof ApplicationException.plines;
    subclass: typeof ApplicationException.subclass;
  } {
    const Class = class extends this {};
    Object.defineProperty(Class, 'name', {
      value: className,
      writable: true,
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
          Defaults,
        },
      );
    };
    Object.defineProperty(Class.prototype, 'name', {
      value: className,
      writable: true,
      enumerable: false,
      configurable: true,
    });
    return Class;
  }

  /**
   * Builder methods & getters
   */

  setId(ID: string): this {
    this._own.id = ID;
    return this;
  }

  getId(): string {
    return this._own.id;
  }

  id(ID: string): this {
    return this.setId(ID);
  }

  setTimestamp(ts: Date): this {
    this._own.timestamp = ts;
    return this;
  }

  getTimestamp(): Date {
    return this._own.timestamp;
  }

  timestamp(ts: Date): this {
    return this.setTimestamp(ts);
  }

  setNumCode(n: number): this {
    this._own.numCode = n;
    return this;
  }

  getNumCode(): number | undefined {
    return this._own?.numCode;
  }

  numCode(n: number): this {
    return this.setNumCode(n);
  }

  setCode(c: string): this {
    this._own.code = c;
    return this;
  }

  getCode(): string | undefined {
    return this._own.code;
  }

  code(c: string): this {
    return this.setCode(c);
  }

  setDisplayMessage(msg: string): this {
    this._own.displayMessage = msg;
    return this;
  }

  private resolveDisplayMessage(): string | undefined {
    if (typeof this._own.displayMessage === 'string') {
      return this._own.displayMessage;
    }
    if (this._options.useMessageAsDisplayMessage) {
      return this.message;
    }
    return undefined;
  }

  private getCompilationContext() {
    return {
      ...this.getDetails(),
      self: {
        message: this.message,

        id: this._own.id,
        timestamp: this._own.timestamp,
        displayMessage: this._own.displayMessage,
        code: this._own.code,
        numCode: this._own.numCode,
        details: this._own.details,

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

  private mutCompileDisplayMessage(): void {
    if (
      typeof this._compiled.compiledDisplayMessage === 'string' ||
      this.resolveDisplayMessage() === undefined
    ) {
      return;
    }
    const compiled = this.compileTemplate(
      this.resolveDisplayMessage() as string,
      this.getCompilationContext(),
    );
    this._compiled.compiledDisplayMessage = compiled;
  }

  private getCompiledDisplayMessage(): string | undefined {
    if (this.resolveDisplayMessage() === undefined) {
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

  getMessage(): string {
    this.mutCompileMessage();
    if (this._compiled?.compiledMessage === undefined) {
      return this.message;
    }
    return this._compiled?.compiledMessage;
  }

  setDetails(d: Record<string, unknown>): this {
    this._own.details = d;
    return this;
  }

  getDetails(): Record<string, unknown> | undefined {
    return this._own.details;
  }

  addDetails(d: Record<string, unknown>) {
    console.log(this.getDetails());
    return this.setDetails({ ...(this.getDetails() ?? {}), ...(d ?? {}) });
  }

  details(d: Record<string, unknown>) {
    return this.addDetails(d);
  }
}

export const AppEx = ApplicationException;
