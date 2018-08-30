import { ValidationError } from "@cross-check/core";
import { FIXME } from "@cross-check/dsl/src/utils";
import { assert } from "ts-std";
import { ValidationBuilder } from "../builders";
import { isAbsent, isNull } from "./is";

function unwrapErrors(errors: ValidationError[]) {
  assert(errors.length === 1);
  assert(errors[0].message.name === "multiple");

  let result = errors[0].message.details as ValidationError[][];

  assert(result.length === 2);
  assert(result[0][0].message.name === "type");

  return result[1];
}

export function nullable<T, U extends T>(
  builder: ValidationBuilder<T, U>
): ValidationBuilder<T | null, U | null> {
  return isNull()
    .or(builder)
    .catch(unwrapErrors) as FIXME<ValidationBuilder<T | null>>;
}

export function maybe<T>(
  builder: ValidationBuilder<T>
): ValidationBuilder<T | null | undefined | void> {
  return isAbsent()
    .or(builder)
    .catch(unwrapErrors) as FIXME<
    ValidationBuilder<T | null | undefined | void>
  >;
}
