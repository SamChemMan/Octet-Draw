package org.apache.logging.log4j;

public final class LogManager {
  private static final Logger NOOP = new Logger() {};
  private LogManager() {}
  public static Logger getLogger(Class<?> c) { return NOOP; }
}
