import { ulid } from 'ulid';
import type { PojoConstructorSync } from 'pojo-constructor';
import { constructPojoSync } from 'pojo-constructor';

type AppExOwnProps = {
  id: string;
  timestamp: Date;
  displayMessage?: string;
  code?: string;
  numCode?: number;
  details?: Record<string, unknown>;
};

type AppExOptions = {
  useClassNameAsCode: boolean;
  useMessageAsDisplayMessage: boolean;
};

type AppExIcfg = AppExOwnProps &
  AppExOptions & {
    message: string;
  };

type AppExCompiledProps = {
  compiledMessage?: string;
  compiledDisplayMessage?: string;
};

function makeApplicationExceptionId(nowDate: Date): string {
  return ['AE', ulid(nowDate.getTime())].join('_');
}

function hasOwnProperty<
  O extends object,
  K extends keyof O,
  V extends Required<O>[K],
>(
  obj: O,
  prop: K,
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
): obj is { [k in K]: V } {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

type AppExIcfgPojoInput = {
  icfgInput: Partial<AppExIcfg>;
  nowDate: Date;
};

class AppExIcfgPojo
  implements PojoConstructorSync<AppExIcfg, AppExIcfgPojoInput>
{
  message({ icfgInput }: AppExIcfgPojoInput) {
    const isOk =
      hasOwnProperty(icfgInput, 'message') &&
      typeof icfgInput.message === 'string';
    return isOk ? icfgInput.message : 'Something went wrong.';
  }

  timestamp({ icfgInput, nowDate }: AppExIcfgPojoInput) {
    const isOk =
      hasOwnProperty(icfgInput, 'timestamp') &&
      icfgInput.timestamp instanceof Date;
    return isOk ? icfgInput.timestamp : new Date(nowDate);
  }

  id({ icfgInput, nowDate }: AppExIcfgPojoInput) {
    const isOk =
      hasOwnProperty(icfgInput, 'id') && typeof icfgInput.id === 'string';
    return isOk ? icfgInput.id : makeApplicationExceptionId(nowDate);
  }

  useClassNameAsCode({ icfgInput }: AppExIcfgPojoInput) {
    const isOk =
      hasOwnProperty(icfgInput, 'useClassNameAsCode') &&
      typeof icfgInput.useClassNameAsCode === 'boolean';
    return isOk ? icfgInput.useClassNameAsCode : false;
  }

  useMessageAsDisplayMessage({ icfgInput }: AppExIcfgPojoInput) {
    const isOk =
      hasOwnProperty(icfgInput, 'useMessageAsDisplayMessage') &&
      typeof icfgInput.useMessageAsDisplayMessage === 'boolean';
    return isOk ? icfgInput.useMessageAsDisplayMessage : false;
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
      ...(!hasOwnProperty(icfg, 'displayMessage')
        ? {}
        : { displayMessage: icfg.displayMessage }),
      ...(!hasOwnProperty(icfg, 'code')
        ? !icfg.useClassNameAsCode
          ? {}
          : { code: this.constructor.name }
        : { code: icfg.code }),
      ...(!hasOwnProperty(icfg, 'numCode') ? {} : { numCode: icfg.numCode }),
      ...(!hasOwnProperty(icfg, 'details') ? {} : { details: icfg.details }),
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
    return constructPojoSync(AppExIcfgPojo, {
      nowDate,
      icfgInput,
    });
  }

  static compileTemplate(
    _templateString: string,
    _compilationContext: Record<string, unknown>,
  ): string {
    // TODO:
    return '123';
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

  static plines(prefix: string, ...lines: string[]): ApplicationException {
    return this.lines(...lines.map((l) => `${prefix}: ${l}`));
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

  private compileDisplayMessage(): void {
    if (this.resolveDisplayMessage() === undefined) {
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
    this.compileDisplayMessage();
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

  compileMessage(): void {
    if (typeof this.message !== 'string') {
      return;
    }
    const compiled = this.compileTemplate(
      this.message,
      this.getCompilationContext(),
    );
    this._compiled.compiledMessage = compiled;
  }

  getMessage(): string {
    this.compileMessage();
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

  details(d: Record<string, unknown>) {
    return this.setDetails(d);
  }
}
