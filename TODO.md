- [x] a way to make message defaultable - .new accept no arg?
- [x] a way to make details typed [supported with extending classes]
- [x] a way to provide a merge function to merge details
- [x] Collect all superdefaults, not only from immediate prototype
- [ ] Simpler subclass with plain options
```typescript
const MyAppException = AppEx.subclass(
  'MyAppException',
  ({ now }) => ({
    useClassNameAsCode: true,
    details: {
      src: 'my-app-api-server',
    },
  }), // but plain object is also supported
  { // a place for static methods
    create(this: ApplicationExceptionStatic, num: number) {
      return this.new(
        '{{pad 20 self.constructor_name}} // ISO Date: {{date-iso self.timestamp}}; Formatted Date: {{date-fmt "d MMMM yyyy, HH:mm:ss" self.timestamp}}; num: {{num}}',
      ).details({ num });
    },
  },
);
const MyAppException = AppEx.subclass('MyAppException', {}, {
  create: // ...
})
const MyAppException = AppEx.subclass('MyAppException', {
  useClassNameAsCode: true,
})
```
- [ ] Allow to parametrize hbs helpers, add example with helpers to format date
- [ ] docs
  - [ ] Make a good guide
  - [x] Steve McConnell disagrees
  - [x] Features
    - fields + builder pattern
    - json representation
    - configurable with good defaults
- [ ] add json schema options
- [ ] tests
- [ ] semantic-release
- [ ] make more files to make code easier to understand
