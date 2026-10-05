using System;
using System.Linq;
using System.Reflection;
using NUnit.Framework;
public static class Runner
{
    public static int Main()
    {
        int pass = 0, fail = 0;
        foreach (var t in Assembly.GetExecutingAssembly().GetTypes().Where(t => t.GetCustomAttribute<TestFixtureAttribute>() != null).OrderBy(t => t.Name))
            foreach (var m in t.GetMethods().Where(m => m.GetCustomAttribute<TestAttribute>() != null))
            {
                try { m.Invoke(Activator.CreateInstance(t), null); pass++; Console.WriteLine($"PASS  {t.Name}.{m.Name}"); }
                catch (TargetInvocationException e) { fail++; Console.WriteLine($"FAIL  {t.Name}.{m.Name}: {e.InnerException.Message}"); }
            }
        Console.WriteLine($"\n{pass} passed, {fail} failed");
        return fail == 0 ? 0 : 1;
    }
}
