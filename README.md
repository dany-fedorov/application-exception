# Application Exception

![Jest coverage](https://raw.githubusercontent.com/dany-fedorov/application-exception/main/badges/coverage-jest%20coverage.svg)
[![Strictest TypeScript Config](https://badgen.net/badge/typescript/strictest "Strictest TypeScript Config")](https://www.npmjs.com/package/@tsconfig/strictest)
[![Package License MIT](https://img.shields.io/npm/l/pojo-constructor.svg)](https://www.npmjs.org/package/application-exception)
[![Npm Version](https://img.shields.io/npm/v/application-exception.svg)](https://www.npmjs.org/package/application-exception)

> **Warning**
> Please use fixed version (remove ^ from package.json).

<!-- TOC -->

* [Motivation](#motivation)
* [Features](#features)
* [Guide](#guide)
    * [Defaults](#defaults)
    * [Fields](#fields)
    * [Constructor variants](#constructor-variants)
    * [Templating](#templating)
    * [Extending: Using ApplicationException.subclass](#extending--using-applicationexceptionsubclass)
    * [Extending: Extending ApplicationException class](#extending--extending-applicationexception-class)
    * [Extending: Custom constructor](#extending--custom-constructor)
    * [Extending: Setting a type for `details` field](#extending--setting-a-type-for-details-field)

<!-- TOC -->

## Motivation

> *"Programs that use exceptions as part of their normal processing suffer from all the readability and
> maintainability problems of classic spaghetti code."*
> — Andy Hunt, Dave Thomas - The Pragmatic Programmer

It is hard to disagree with software engineering classics. Nevertheless, many times I found myself reimplementing the
same pattern where
thrown exceptions signify diversion from happy path and carry more information than `message` and `stack` found on
the `Error` class.

I think there is nothing wrong with implementing this each time for every new project, because
different projects are going to have different exceptions. And the citation above hints that I find it preferable to
handle as many exceptions as possible with normal control flow.

The use case for this library that I have in mind is an application back-end which is a thin layer over one or more data
sources (e.g. databases or third-party APIs) and when you throw exceptions expecting a front-end to handle them. It is
likely that in case of working on a project like this you also win more from delivering quickly then you win from
writing exceptional (pun intended) quality code.

I'll be happy if this library is useful for somebody except myself, but please make sure that you really need it.

## Features

- Provides a selection of fields most likely to be useful when building an API back-end or a CLI program
- Builder pattern for better DX
- Provides a JSON representation available with `toJSON` method
- Configurable with good defaults

## Guide

### Defaults

By default `ApplicationException` sets `id`, `timestamp` and `message` fields.

<sub>(Run
with `npm run ts-file ./examples/default-fields-example.ts` or see
example's [source code](./examples/default-fields-example.ts))</sub>

```typescript
const e = AppEx.new();

console.log('id:'.padEnd(10), e.getId());
console.log('timestamp:'.padEnd(10), e.getTimestamp());
console.log('message:'.padEnd(10), e.getMessage());
```

prints

```text
Id:        AE_00Q6F4K3K7FPYQNEFJA1GV465Z
Timestamp: 2023-01-08T02:45:12.309Z
Message:   Something went wrong
```

You can provide a custom message to `ApplicationException.new`.

<sub>(Run
with `npm run ts-file ./examples/default-fields-with-custom-message-example.ts` or see
example's [source code](./examples/default-fields-with-custom-message-example.ts))</sub>

```typescript
const e = AppEx.new(`I'm an error message`);

console.log('id:'.padEnd(10), e.getId());
console.log('timestamp:'.padEnd(10), e.getTimestamp());
console.log('message:'.padEnd(10), e.getMessage());
```

prints

```text
id:        AE_BT006J8JET62NVQM16Z890ENPR
timestamp: 2023-01-08T02:51:02.597Z
message:   I'm an error message
```

### Fields

All fields are listed in `AppExOwnProps` type.<br>

You can use builder methods to set all of these fields except for `message` field because once message is set on `Error`
instance it is impossible to change it.

Here is a simple example.

<sub>(Run with `npm run ts-file ./examples/builder-pattern-simple-example.ts` or see
example's [source code](./examples/builder-pattern-simple-example.ts))</sub>

```typescript
throw AppEx.new(`Could not fetch a resource with id ${id}`)
  .numCode(404)
  .code('RESOURCE_NOT_FOUND')
  .details({id});
```

This is a more complicated example.

<sub>(Run
with `npm run ts-file ./examples/builder-pattern-example.ts` or see
example's [source code](./examples/builder-pattern-example.ts))</sub>

```typescript
function addUser(email: string): void {
  try {
    storeUser(email);
  } catch (caught) {
    if (caught instanceof Error && caught.message === 'User already exists') {
      throw AppEx.new(`User with this email already exists - ${email}`)
        .displayMessage(
          'We already have a user with this email in the system, maybe you signed up earlier?',
        )
        .code('USER_ALREADY_EXISTS')
        .numCode(400)
        .causedBy(caught)
        .details({email});
    } else {
      throw AppEx.new('Could not create user')
        .displayMessage('Something went wrong, please visit help center')
        .numCode(500)
        .causedBy(caught)
        .details({email});
    }
  }
}
```

### Constructor variants

`ApplicationException.new` is the simplest constructor variant.

Other constructors available by default are `lines` and `prefixedLines` (or `plines`).

<sub>(Run
with `npm run ts-file ./examples/constructor-variants-example.ts` or see
example's [source code](./examples/constructor-variants-example.ts))</sub>

```typescript
const e1 = AppEx.lines(
  'Could not fetch user from ThirdParty',
  `- HTTP: GET https://example.org/api/v1`,
  `- Request headers: ${JSON.stringify(req.headers)}`,
  `- Response status: ${JSON.stringify(res.status)}`,
  `- Response headers: ${JSON.stringify(res.headers)}`,
);

const e2 = AppEx.prefixedLines(
  'UserService.getUser',
  'Could not fetch user from ThirdParty',
  ['- HTTP'.padEnd(20), 'GET https://example.org/api/v1'].join(' - '),
  ['- Request headers'.padEnd(20), JSON.stringify(req.headers)].join(' - '),
  ['- Response status'.padEnd(20), JSON.stringify(res.status)].join(' - '),
  ['- Response headers'.padEnd(20), JSON.stringify(res.headers)].join(' - '),
);
```

### Templating

Fields `message` and `displayMessage` are actually [Handlebars](https://handlebarsjs.com/) templates.

<sub>(Run
with `npm run ts-file ./examples/simple-templating-example.ts` or see
example's [source code](./examples/simple-templating-example.ts))</sub>

```typescript
const e = AppEx.new('Bad thing happened').displayMessage(
  'Something went wrong, please contact tech support and provide this id - {{self.id}}',
);

console.log(e.getDisplayMessage());
```

prints

```text
Something went wrong, please contact tech support and provide this id - AE_0DFG6FGFRCY2THPMMCNXAZF4KF
```

You can use fields specified in `details` on the top level. Use `self` to access exception object in handlebars
template. `self` contains all fields available through builder methods on it's top level, like `id` or `code`.
Also, there is a `json` helper function present in compilation context.

All compilation context available is presented in the following example.

<sub>(Run
with `npm run ts-file ./examples/all-templating-helpers-example.ts` or see
example's [source code](./examples/all-templating-helpers-example.ts))</sub>

```typescript
const e = AppEx.new('Bad thing happened')
  .details({
    a: 12345,
    b: 'b-field',
  })
  .displayMessageLines(
    '- top level fields',
    '- - a - {{a}}',
    '- - b - {{b}}',
    '- self',
    '- - self.id - {{self.id}}',
    '- - self.timestamp - {{self.timestamp}}',
    '- - self.code - {{self.code}}',
    '- - self.numCode - {{self.numCode}}',
    '- - self.details - {{{json self.details}}}',
    '- - self.details indented - {{{json self.details 2}}}',
  );
```

### Extending: Using ApplicationException.subclass

<sub>(Run
with `npm run ts-file ./examples/subclass-example.ts` or see
example's [source code](./examples/subclass-example.ts))</sub>

### Extending: Extending ApplicationException class

TODO

### Extending: Custom constructor

TODO

### Extending: Setting a type for `details` field

TODO
