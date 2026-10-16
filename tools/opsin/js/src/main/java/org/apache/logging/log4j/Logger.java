package org.apache.logging.log4j;

/** No-op stand-in for log4j-api, covering only the calls OPSIN makes. */
public interface Logger {
  default void debug(String m) {}
  default void debug(String m, Throwable t) {}
  default void trace(String m) {}
  default void warn(String m, Throwable t) {}
  default boolean isDebugEnabled() { return false; }
  default boolean isTraceEnabled() { return false; }
}
