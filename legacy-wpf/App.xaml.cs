using System;
using System.IO;
using System.Windows;

namespace StoryTracker
{
    public partial class App : Application
    {
        protected override void OnStartup(StartupEventArgs e)
        {
            base.OnStartup(e);
            LoadTheme();
        }

        private void LoadTheme()
        {
            string themeName = "DarkTheme.xaml"; // Default theme
            try
            {
                if (File.Exists("theme.settings"))
                {
                    themeName = File.ReadAllText("theme.settings");
                }

                Application.Current.Resources.MergedDictionaries.Clear();
                Application.Current.Resources.MergedDictionaries.Add(
                    new ResourceDictionary { Source = new Uri($"Themes/{themeName}", UriKind.Relative) });
            }
            catch
            {
                // If something fails, just load the default theme
                Application.Current.Resources.MergedDictionaries.Clear();
                Application.Current.Resources.MergedDictionaries.Add(
                    new ResourceDictionary { Source = new Uri($"Themes/{themeName}", UriKind.Relative) });
            }
        }
    }
}