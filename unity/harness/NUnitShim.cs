// Minimal NUnit surface so the EditMode tests compile and run outside Unity in CI.
// Inside Unity, the real NUnit from the Test Framework package is used instead.
using System;
namespace NUnit.Framework
{
    [AttributeUsage(AttributeTargets.Class)] public class TestFixtureAttribute : Attribute { }
    [AttributeUsage(AttributeTargets.Method)] public class TestAttribute : Attribute { }
    public delegate void TestDelegate();
    public class AssertionException : Exception { public AssertionException(string m) : base(m) { } }
    public static class Assert
    {
        public static void AreEqual(object expected, object actual)
        { if (!Equals(expected, actual)) throw new AssertionException($"Expected {expected} but was {actual}"); }
        public static void AreEqual(double expected, double actual, double delta)
        { if (Math.Abs(expected - actual) > delta) throw new AssertionException($"Expected {expected} +/- {delta} but was {actual}"); }
        public static void IsTrue(bool c) { if (!c) throw new AssertionException("Expected true"); }
        public static void IsFalse(bool c) { if (c) throw new AssertionException("Expected false"); }
        public static T Throws<T>(TestDelegate code) where T : Exception
        {
            try { code(); } catch (T e) { return e; } catch (Exception e) { throw new AssertionException($"Expected {typeof(T).Name} but got {e.GetType().Name}"); }
            throw new AssertionException($"Expected {typeof(T).Name} but nothing was thrown");
        }
    }
}
