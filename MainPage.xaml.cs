namespace StoryTracker.MAUI;

public partial class MainPage : ContentPage
{
    // --- FIELDS ---
    private readonly DatabaseService _dbService;
    private readonly ImportService _importService = new ImportService();
    private readonly ExportService _exportService = new ExportService();
    private List<Story> _allStories = new List<Story>();
    private Story _selectedStory;
    private Chapter _selectedChapter;

    // --- CONSTRUCTOR ---
    public MainPage(string connectionString)
    {
        InitializeComponent();
        _dbService = new DatabaseService(connectionString);

        // Wire up event handlers from the XAML
        StoryListView.ItemSelected += OnStorySelected;
        ChapterListView.ItemSelected += OnChapterSelected;
        AddStoryButton.Clicked += OnAddStoryClicked;
        DeleteStoryButton.Clicked += OnDeleteStoryClicked;
        AddChapterButton.Clicked += OnAddChapterClicked;
        DeleteChapterButton.Clicked += OnDeleteChapterClicked;
        SaveChapterButton.Clicked += OnSaveChapterClicked;
        SaveStoryDetailsButton.Clicked += OnSaveStoryDetailsClicked;

        // Wire up the new toolbar buttons
        BoldButton.Clicked += BoldButton_Clicked;
        ItalicButton.Clicked += ItalicButton_Clicked;
        UnderlineButton.Clicked += UnderlineButton_Clicked;
    }

    protected override void OnAppearing()
    {
        base.OnAppearing();
        LoadStories();
    }

    // --- STORY METHODS ---
    private void LoadStories()
    {
        try
        {
            _allStories = _dbService.LoadStoryTitles();
            StoryListView.ItemsSource = _allStories;
        }
        catch (Exception ex) { DisplayAlert("Error", $"Could not load stories: {ex.Message}", "OK"); }
    }

    private async void OnStorySelected(object sender, SelectedItemChangedEventArgs e)
    {
        if (e.SelectedItem is not Story selectedStory) return;

        _selectedStory = _dbService.GetStoryDetails(selectedStory.Id);
        StoryTitleEntry.Text = _selectedStory.Title;
        StoryTypeEntry.Text = _selectedStory.StoryType;
        GenreEntry.Text = _selectedStory.Genre;
        StatusEntry.Text = _selectedStory.Status;

        await LoadChaptersForStory(_selectedStory.Id);
    }

    private async void OnAddStoryClicked(object sender, EventArgs e)
    {
        string newTitle = await DisplayPromptAsync("New Story", "Enter a title for the new story:");
        if (!string.IsNullOrWhiteSpace(newTitle))
        {
            try
            {
                _dbService.CreateStory(newTitle);
                LoadStories();
            }
            catch (Exception ex) { await DisplayAlert("Error", $"Could not create story: {ex.Message}", "OK"); }
        }
    }

    private async void OnDeleteStoryClicked(object sender, EventArgs e)
    {
        if (_selectedStory == null) { await DisplayAlert("Error", "Please select a story to delete.", "OK"); return; }
        bool confirmed = await DisplayAlert("Confirm Delete", $"Are you sure you want to delete '{_selectedStory.Title}'?", "Yes", "No");
        if (confirmed)
        {
            try
            {
                _dbService.DeleteStory(_selectedStory.Id);
                LoadStories();
                ChapterListView.ItemsSource = null;
            }
            catch (Exception ex) { await DisplayAlert("Error", $"Could not delete story: {ex.Message}", "OK"); }
        }
    }

    private async void OnSaveStoryDetailsClicked(object sender, EventArgs e)
    {
        if (_selectedStory == null) { await DisplayAlert("Error", "Please select a story first.", "OK"); return; }
        try
        {
            _selectedStory.Title = StoryTitleEntry.Text;
            _selectedStory.StoryType = StoryTypeEntry.Text;
            _selectedStory.Genre = GenreEntry.Text;
            _selectedStory.Status = StatusEntry.Text;
            _dbService.SaveStoryDetails(_selectedStory);
            await DisplayAlert("Success", "Story details saved!", "OK");
            LoadStories();
        }
        catch (Exception ex) { await DisplayAlert("Error", $"Could not save details: {ex.Message}", "OK"); }
    }

    // --- CHAPTER METHODS ---
    private async Task LoadChaptersForStory(int storyId)
    {
        try
        {
            var chapters = _dbService.GetChaptersForStory(storyId);
            ChapterListView.ItemsSource = chapters;
        }
        catch (Exception ex) { await DisplayAlert("Error", $"Could not load chapters: {ex.Message}", "OK"); }
    }

    private async void OnChapterSelected(object sender, SelectedItemChangedEventArgs e)
    {
        if (e.SelectedItem is not Chapter selectedChapter) return;
        _selectedChapter = selectedChapter;
        try
        {
            string htmlContent = _dbService.GetChapterText(_selectedChapter.Id);
            StoryRichEditor.SetHtml(htmlContent);
            ChapterTitleEntry.Text = _selectedChapter.Title;
        }
        catch (Exception ex) { await DisplayAlert("Error", $"Could not load chapter text: {ex.Message}", "OK"); }
    }

    private async void OnAddChapterClicked(object sender, EventArgs e)
    {
        if (_selectedStory == null) { await DisplayAlert("Error", "Please select a story first.", "OK"); return; }
        string newTitle = await DisplayPromptAsync("New Chapter", "Enter a title for the new chapter:");
        if (!string.IsNullOrWhiteSpace(newTitle))
        {
            try
            {
                int nextChapterNumber = (ChapterListView.ItemsSource?.Cast<object>().Count() ?? 0) + 1;
                _dbService.CreateChapter(_selectedStory.Id, nextChapterNumber, newTitle, "");
                await LoadChaptersForStory(_selectedStory.Id);
            }
            catch (Exception ex) { await DisplayAlert("Error", $"Could not create chapter: {ex.Message}", "OK"); }
        }
    }

    private async void OnDeleteChapterClicked(object sender, EventArgs e)
    {
        if (_selectedChapter == null) { await DisplayAlert("Error", "Please select a chapter to delete.", "OK"); return; }
        bool confirmed = await DisplayAlert("Confirm Delete", $"Are you sure you want to delete '{_selectedChapter.Title}'?", "Yes", "No");
        if (confirmed)
        {
            try
            {
                _dbService.DeleteChapter(_selectedChapter.Id);
                await LoadChaptersForStory(_selectedStory.Id);
            }
            catch (Exception ex) { await DisplayAlert("Error", $"Could not delete chapter: {ex.Message}", "OK"); }
        }
    }

    private async void OnSaveChapterClicked(object sender, EventArgs e)
    {
        if (_selectedChapter == null) { await DisplayAlert("Error", "Please select a chapter to save.", "OK"); return; }

        _selectedChapter.Title = ChapterTitleEntry.Text;
        _selectedChapter.Text = await StoryRichEditor.GetHtmlAsync();
        // Word count from HTML is a future feature.
        _selectedChapter.WordCount = 0;

        try
        {
            _dbService.SaveChapter(_selectedChapter);
            await DisplayAlert("Success", "Chapter saved successfully!", "OK");
        }
        catch (Exception ex) { await DisplayAlert("Error", $"Could not save chapter: {ex.Message}", "OK"); }
    }

    // --- TOOLBAR METHODS ---
    private void BoldButton_Clicked(object sender, EventArgs e) => StoryRichEditor.ToggleBold();
    private void ItalicButton_Clicked(object sender, EventArgs e) => StoryRichEditor.ToggleItalic();
    private void UnderlineButton_Clicked(object sender, EventArgs e) => StoryRichEditor.ToggleUnderline();

    // --- MENU METHODS ---
    private async void OnImportChapterClicked(object sender, EventArgs e)
    {
        if (_selectedStory == null)
        {
            await DisplayAlert("Error", "Please select a story to import the chapter into.", "OK");
            return;
        }

        var pickOptions = new PickOptions { PickerTitle = "Import Chapter" };
        try
        {
            var (fileName, content) = await _importService.ImportFile(pickOptions);
            if (content != null)
            {
                int nextChapterNumber = (ChapterListView.ItemsSource?.Cast<object>().Count() ?? 0) + 1;
                _dbService.CreateChapter(_selectedStory.Id, nextChapterNumber, fileName, content);
                await LoadChaptersForStory(_selectedStory.Id);
                await DisplayAlert("Success", $"Chapter '{fileName}' imported successfully.", "OK");
            }
        }
        catch (Exception ex) { await DisplayAlert("Error", $"Failed to import file: {ex.Message}", "OK"); }
    }
}