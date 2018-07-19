import { unknown } from "ts-std";
import {
  AbstractDictionaryDescriptor,
  AliasDescriptor,
  CollectionDescriptor,
  DictionaryDescriptor,
  PrimitiveDescriptor,
  RecordDescriptor,
  RequiredDescriptor,
  defaults
} from "../fundamental/descriptor";
import { Type } from "../fundamental/value";
import { exhausted } from "../utils";
import {
  Accumulator,
  DictionaryPosition,
  Pos,
  Reporter,
  genericPosition
} from "./reporter";

export interface VisitorDelegate {
  alias(type: AliasDescriptor, position: Pos): unknown;
  required(type: RequiredDescriptor, position: Pos): unknown;
  generic(type: CollectionDescriptor, position: Pos): unknown;
  dictionary(type: DictionaryDescriptor, position: Pos): unknown;
  record(type: RecordDescriptor, position: Pos): unknown;
  primitive(type: PrimitiveDescriptor, position: Pos): unknown;
}

export class Visitor {
  constructor(private delegate: VisitorDelegate) {}

  visit(type: Type, position: Pos): unknown {
    let descriptor = type.descriptor;

    switch (descriptor.type) {
      case "Alias": {
        return this.delegate.alias(descriptor, position);
      }

      case "Features": {
        throw new Error("Not implemented");
      }

      case "Required": {
        return this.delegate.required(descriptor, position);
      }

      case "Pointer":
      case "Iterator":
      case "List": {
        return this.delegate.generic(descriptor, position);
      }

      case "Dictionary": {
        return this.delegate.dictionary(descriptor, position);
      }

      case "Record": {
        let desc: AliasDescriptor = defaults("Alias", {
          name: descriptor.name,
          isBase: descriptor.isBase,
          inner: type,
          description: descriptor.description
        });

        return this.delegate.alias(desc, position);
      }

      case "Primitive": {
        return this.delegate.primitive(descriptor, position);
      }

      default:
        exhausted(descriptor);
    }
  }
}

export interface RecursiveDelegateTypes {
  primitive: unknown;
  generic: unknown;
  dictionary: unknown;
  alias: unknown;
  record: unknown;
}

export type DelegateItem<T extends RecursiveDelegateTypes> =
  | T["primitive"]
  | T["generic"]
  | T["alias"]
  | T["dictionary"];

/**
 * The `RecursiveDelegate` interface receives recursive events for the tree
 * of schema elements, passing the return value of child types into the
 * events for container types.
 *
 * For example, if you have this type:
 *
 * ```ts
 * Record("person", {
 *   name: SingleLineString(),
 *   phoneNumber: List(SingleWordString())
 * })
 * ```
 *
 * In the `record` event, you should call `this.visitor.processDictionary(record, callback)`,
 * which will invoke the following events in this order:
 *
 * 1. `primitive(desc)` (`desc` is a descriptor for SingleLineString in name)
 *   a. the `processDictionary` callback will be called with `name` and the return
 *      value of _1_
 * 2. `primitive(desc)` (`desc` is a descriptor for SingleLineString in phoneNumber)
 *   a. `generic(of, desc)` will be called with the return value of _2_ and the descriptor
 *      for `List`
 *     i. the `processDictionary` callback will be called with `phoneNumber` and
 *        the return value of `2.a`
 */
export interface RecursiveDelegate<
  T extends RecursiveDelegateTypes = RecursiveDelegateTypes
> {
  required(inner: DelegateItem<T>, descriptor: RequiredDescriptor): unknown;
  primitive(descriptor: PrimitiveDescriptor): T["primitive"];
  generic(of: DelegateItem<T>, descriptor: CollectionDescriptor): T["generic"];
  alias(descriptor: AliasDescriptor): T["alias"];
  dictionary(descriptor: DictionaryDescriptor): T["dictionary"];
  record(descriptor: RecordDescriptor): T["record"];
}

export class RecursiveVisitor<T extends RecursiveDelegateTypes>
  implements VisitorDelegate {
  static build<T extends RecursiveDelegateTypes>(
    delegate: RecursiveDelegate<T>
  ): RecursiveVisitor<T> {
    let recursiveVisitor = new RecursiveVisitor<T>(delegate);
    let visitor = new Visitor(recursiveVisitor);
    recursiveVisitor.visitor = visitor;
    return recursiveVisitor;
  }

  private visitor!: Visitor;

  private constructor(private recursiveDelegate: RecursiveDelegate<T>) {}

  alias(descriptor: AliasDescriptor): unknown {
    return this.recursiveDelegate.alias(descriptor);
  }

  required(descriptor: RequiredDescriptor): unknown {
    let inner = this.visitor.visit(descriptor.inner, Pos.Only);
    return this.recursiveDelegate.required(inner, descriptor);
  }

  primitive(descriptor: PrimitiveDescriptor): unknown {
    return this.recursiveDelegate.primitive(descriptor);
  }

  generic(descriptor: CollectionDescriptor): unknown {
    let position = genericPosition(descriptor.type);

    return this.recursiveDelegate.generic(
      this.visitor.visit(descriptor.inner, position),
      descriptor
    );
  }

  record(descriptor: RecordDescriptor): unknown {
    return this.recursiveDelegate.record(descriptor);
  }

  dictionary(descriptor: DictionaryDescriptor): unknown {
    return this.recursiveDelegate.dictionary(descriptor);
  }

  processDictionary(
    descriptor: DictionaryDescriptor | RecordDescriptor,
    callback: (item: DelegateItem<T>, key: string) => void
  ): unknown {
    let input = descriptor.members;
    let keys = Object.keys(input);
    let last = keys.length - 1;

    keys.forEach((key, i) => {
      let dictPosition = DictionaryPosition({ index: i, last });

      callback(this.visitor.visit(input[key]!, dictPosition), key);
    });
  }
}

// export function recursiveVisit(delegate: RecursiveDelegate, record: Record) {
//   let visitor = RecursiveVisitor.build(delegate);
//   return visitor.record(record.descriptor);
// }

export class StringVisitor<Buffer extends Accumulator<Inner>, Inner, Options>
  implements VisitorDelegate {
  static build<Buffer extends Accumulator<Inner>, Inner, Options>(
    reporter: Reporter<Buffer, Inner, Options>
  ): StringVisitor<Buffer, Inner, Options> {
    let stringVisitor = new StringVisitor(reporter);
    let visitor = new Visitor(stringVisitor);
    stringVisitor.visitor = visitor;
    return stringVisitor;
  }

  private visitor!: Visitor;

  private constructor(private reporter: Reporter<Buffer, Inner, Options>) {}

  alias(descriptor: AliasDescriptor, position: Pos): unknown {
    this.reporter.startAlias(position, descriptor);
    this.reporter.endAlias(position, descriptor);
  }

  required(descriptor: RequiredDescriptor, position: Pos): unknown {
    this.reporter.startRequired(position, descriptor);
    this.visitor.visit(descriptor.inner, position);
    this.reporter.endRequired(position, descriptor);
  }

  generic(descriptor: CollectionDescriptor, position: Pos): unknown {
    this.reporter.startGenericValue(position, descriptor);
    let pos = genericPosition(descriptor.type);
    this.visitor.visit(descriptor.inner, pos);
    this.reporter.endGenericValue(position, descriptor);
  }

  dictionary(descriptor: DictionaryDescriptor, position: Pos): void {
    this.reporter.startDictionary(position, descriptor);
    this.dictionaryBody(descriptor);
    this.reporter.endDictionary(position, descriptor);
  }

  record(descriptor: RecordDescriptor, position: Pos): Inner {
    this.reporter.startRecord(position, descriptor);
    this.dictionaryBody(descriptor);
    this.reporter.endRecord(position, descriptor);

    return this.reporter.finish();
  }

  primitive(descriptor: PrimitiveDescriptor, position: Pos): unknown {
    this.reporter.primitiveValue(position, descriptor);
  }

  dictionaryBody(descriptor: AbstractDictionaryDescriptor) {
    let members = descriptor.members;
    let keys = Object.keys(members);
    let last = keys.length - 1;

    keys.forEach((key, i) => {
      let position = DictionaryPosition({ index: i, last });

      this.reporter.addKey(position, key, members[key]!.descriptor);
      this.visitor.visit(members[key]!, position);
      this.reporter.endValue(position, members[key]!.descriptor);
    });
  }
}
