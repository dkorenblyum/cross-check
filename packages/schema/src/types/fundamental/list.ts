import { ValidationBuilder, validators } from "@cross-check/dsl";
import { unknown } from "ts-std";
import { ListDescriptor } from "./descriptor";
import { isRequired } from "./required";
import { AbstractType, Type } from "./value";

const isPresentArray = validators.is(
  (value: unknown[]): value is unknown[] => value.length > 0,
  "present-array"
);

class ArrayImpl extends AbstractType {
  constructor(readonly descriptor: ListDescriptor) {
    super(descriptor);
  }

  protected get type(): Type {
    return this.descriptor.args;
  }

  get base(): Type {
    return new ArrayImpl({
      ...this.descriptor,
      args: this.type.base,
      metadata: { allowEmpty: true }
    });
  }

  serialize(js: any[]): any {
    let itemType = this.defaultItem;

    return js.map(item => itemType.serialize(item));
  }

  parse(wire: any[]): any {
    let itemType = this.defaultItem;

    return wire.map(item => itemType.parse(item));
  }

  validation(): ValidationBuilder<unknown> {
    let validator = validators.array(this.defaultItem.validation());
    if (!this.descriptor.metadata.allowEmpty) {
      validator = isPresentArray().andThen(validator);
    }

    return validator;
  }

  private get defaultItem(): Type {
    // List items are required by default
    if (isRequired(this.type.descriptor) === null) {
      return this.type.required();
    } else {
      return this.type;
    }
  }
}

export function List(
  item: Type,
  { allowEmpty }: { allowEmpty: boolean } = { allowEmpty: false }
): Type {
  return new ArrayImpl({
    type: "List",
    description: `List of ${item.descriptor.name || "anonymous"}`,
    args: item,
    metadata: { allowEmpty },
    name: null,
    features: []
  });
}
