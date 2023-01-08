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

(Run
with `npm run ts-file ./examples/default-fields-example.ts` or see
example's [source code](./examples/default-fields-example.ts))

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

(Run
with `npm run ts-file ./examples/default-fields-with-custom-message-example.ts` or see
example's [source code](./examples/default-fields-with-custom-message-example.ts))

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

(Run
with `npm run ts-file ./examples/builder-pattern-example.ts` or see
example's [source code](./examples/builder-pattern-example.ts))

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

(Run
with `npm run ts-file ./examples/constructor-variants-example.ts` or see
example's [source code](./examples/constructor-variants-example.ts))

TODO

### Templating

(Run
with `npm run ts-file ./examples/simple-templating-example.ts` or see
example's [source code](./examples/simple-templating-example.ts))

(Run
with `npm run ts-file ./examples/all-templating-helpers-example.ts` or see
example's [source code](./examples/all-templating-helpers-example.ts))

TODO

### Extending: Using ApplicationException.subclass

TODO

### Extending: Extending ApplicationException class

TODO

### Extending: Custom constructor

TODO

### Extending: Setting a type for `details` field

TODO
